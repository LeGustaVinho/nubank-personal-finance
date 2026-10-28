import React, { useMemo, useState } from 'react';
import {
  Landmark,
  Calendar,
  ArrowDownLeft,
  ArrowUpRight,
  CreditCard,
  PiggyBank,
  Layers,
  Receipt,
  Search,
  ArrowUpDown,
  TrendingUp,
  TrendingDown,
  Wallet,
  Building2,
  Clock,
} from 'lucide-react';
import { CsvFileSummary, SourceType, UnifiedTransaction } from '../../server/types';
import {
  formatBRL,
  formatDateBR,
  formatMonthFull,
  getCategoryColor,
} from '../utils/formatters';
import { MissingStatementsTracker } from './MissingStatementsTracker';

interface BankAccountStatementsViewProps {
  allTransactions: UnifiedTransaction[];
  files?: CsvFileSummary[];
  onOpenUploadModal?: () => void;
  onTogglePartialFile?: (
    source: SourceType,
    fileName: string,
    isPartial: boolean
  ) => Promise<void>;
}

interface BankStatementBucket {
  statementKey: string; // e.g. '2026-09' or 'ALL'
  month: string;
  fileName: string;
  totalIncome: number;
  directExpensesGross: number;
  refundsTotal: number;
  directExpensesNet: number;
  ccPaymentsTotal: number;
  investmentsApplied: number;
  investmentsRedeemed: number;
  netCashflow: number; // Income + Redeemed + Refunds - DirectExpensesGross - CCPayments - Applied
  operationalBalance: number; // Income - (DirectExpensesNet + CCPayments)
  items: UnifiedTransaction[];
}

export const BankAccountStatementsView: React.FC<BankAccountStatementsViewProps> = ({
  allTransactions,
  files = [],
  onOpenUploadModal,
  onTogglePartialFile,
}) => {
  const partialBankFiles = useMemo(() => {
    const s = new Set<string>();
    for (const f of files) {
      if (f.source === 'bankAccount' && f.isPartial) {
        s.add(f.fileName);
      }
    }
    return s;
  }, [files]);
  const statements = useMemo(() => {
    const map = new Map<string, BankStatementBucket>();

    const createEmptyBucket = (
      statementKey: string,
      month: string,
      fileName: string
    ): BankStatementBucket => ({
      statementKey,
      month,
      fileName,
      totalIncome: 0,
      directExpensesGross: 0,
      refundsTotal: 0,
      directExpensesNet: 0,
      ccPaymentsTotal: 0,
      investmentsApplied: 0,
      investmentsRedeemed: 0,
      netCashflow: 0,
      operationalBalance: 0,
      items: [],
    });

    const addTxToBucket = (bucket: BankStatementBucket, tx: UnifiedTransaction) => {
      bucket.items.push(tx);
      const absVal = Math.abs(tx.rawAmount);

      if (tx.flowKind === 'income') {
        bucket.totalIncome += absVal;
      } else if (tx.flowKind === 'expense' || tx.flowKind === 'iof') {
        bucket.directExpensesGross += absVal;
      } else if (tx.flowKind === 'refund') {
        bucket.refundsTotal += absVal;
      } else if (tx.flowKind === 'cc_payment') {
        bucket.ccPaymentsTotal += absVal;
      } else if (tx.flowKind === 'investment') {
        if (tx.rawAmount < 0) {
          bucket.investmentsApplied += absVal;
        } else {
          bucket.investmentsRedeemed += absVal;
        }
      }
      bucket.netCashflow += tx.rawAmount;
    };

    const allBucket = createEmptyBucket(
      'ALL',
      'ALL',
      'Todos os extratos em bankAccount/'
    );

    for (const tx of allTransactions) {
      if (tx.source !== 'bankAccount') continue;
      const key = tx.competenceMonth;
      if (!map.has(key)) {
        map.set(key, createEmptyBucket(key, key, tx.sourceFile));
      }
      const bucket = map.get(key)!;
      addTxToBucket(bucket, tx);
      addTxToBucket(allBucket, tx);
    }

    const finalizeBucket = (b: BankStatementBucket) => {
      b.directExpensesNet = Math.max(0, b.directExpensesGross - b.refundsTotal);
      b.operationalBalance =
        b.totalIncome - (b.directExpensesNet + b.ccPaymentsTotal);
      b.items.sort((x, y) => y.date.localeCompare(x.date));
    };

    const sortedMonthly = Array.from(map.values()).sort((a, b) =>
      b.month.localeCompare(a.month)
    );
    sortedMonthly.forEach(finalizeBucket);
    finalizeBucket(allBucket);

    return {
      monthly: sortedMonthly,
      allBucket,
    };
  }, [allTransactions]);

  const [selectedStatementKey, setSelectedStatementKey] = useState<string>(
    statements.monthly[0]?.statementKey || 'ALL'
  );
  const [viewMode, setViewMode] = useState<'grouped' | 'operations' | 'chronological'>(
    'grouped'
  );
  const [groupFilterFlow, setGroupFilterFlow] = useState<
    'ALL' | 'expense' | 'income' | 'cc_payment' | 'investment'
  >('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [chronoSortField, setChronoSortField] = useState<'date' | 'amount' | 'merchant'>(
    'date'
  );
  const [chronoSortDir, setChronoSortDir] = useState<'asc' | 'desc'>('desc');

  const currentStatement = useMemo(() => {
    if (selectedStatementKey === 'ALL') return statements.allBucket;
    return (
      statements.monthly.find((s) => s.statementKey === selectedStatementKey) ||
      statements.monthly[0] ||
      statements.allBucket
    );
  }, [statements, selectedStatementKey]);

  // Grouped counterparties inside the selected bank statement
  const groupedCounterparties = useMemo(() => {
    if (!currentStatement) return [];
    const map = new Map<
      string,
      {
        key: string;
        merchantGroup: string;
        category: string;
        flowKind: UnifiedTransaction['flowKind'];
        documentId: string | null;
        operationTypes: Set<string>;
        totalAmount: number;
        count: number;
        items: UnifiedTransaction[];
      }
    >();

    const q = searchTerm.trim().toLowerCase();

    for (const tx of currentStatement.items) {
      if (groupFilterFlow !== 'ALL') {
        if (groupFilterFlow === 'expense') {
          if (tx.flowKind !== 'expense' && tx.flowKind !== 'refund') continue;
        } else if (tx.flowKind !== groupFilterFlow) {
          continue;
        }
      }

      if (q) {
        const hay = `${tx.merchantGroup} ${tx.rawDescription} ${tx.category} ${
          tx.documentId || ''
        }`.toLowerCase();
        if (!hay.includes(q)) continue;
      }

      // Separate income vs expense vs investment vs cc_payment so they don't mix
      const flowGroup =
        tx.flowKind === 'refund' ? 'expense' : tx.flowKind;
      const key = `${flowGroup}::${tx.merchantGroup}`;

      if (!map.has(key)) {
        map.set(key, {
          key,
          merchantGroup: tx.merchantGroup,
          category: tx.category,
          flowKind: flowGroup,
          documentId: tx.documentId,
          operationTypes: new Set<string>(),
          totalAmount: 0,
          count: 0,
          items: [],
        });
      }

      const entry = map.get(key)!;
      entry.items.push(tx);
      entry.operationTypes.add(tx.operationType);
      if (!entry.documentId && tx.documentId) {
        entry.documentId = tx.documentId;
      }

      if (tx.flowKind === 'refund') {
        entry.totalAmount -= Math.abs(tx.rawAmount);
      } else {
        entry.totalAmount += Math.abs(tx.rawAmount);
        entry.count += 1;
      }
    }

    return Array.from(map.values()).sort((a, b) => b.totalAmount - a.totalAmount);
  }, [currentStatement, groupFilterFlow, searchTerm]);

  // Breakdown by operationType (Pix Enviado, Pix Recebido, Boleto, Débito, Fatura, RDB/CDB)
  const operationSummary = useMemo(() => {
    if (!currentStatement) return [];
    const map = new Map<
      string,
      {
        operationType: string;
        flowKind: UnifiedTransaction['flowKind'];
        totalAmount: number;
        count: number;
      }
    >();

    for (const tx of currentStatement.items) {
      const key = `${tx.operationType}::${tx.flowKind}`;
      if (!map.has(key)) {
        map.set(key, {
          operationType: tx.operationType,
          flowKind: tx.flowKind,
          totalAmount: 0,
          count: 0,
        });
      }
      const entry = map.get(key)!;
      entry.totalAmount += Math.abs(tx.rawAmount);
      entry.count += 1;
    }

    return Array.from(map.values()).sort((a, b) => b.totalAmount - a.totalAmount);
  }, [currentStatement]);

  // Filtered and sorted chronological items
  const chronologicalItems = useMemo(() => {
    if (!currentStatement) return [];
    const q = searchTerm.trim().toLowerCase();

    const filtered = currentStatement.items.filter((tx) => {
      if (groupFilterFlow !== 'ALL') {
        if (groupFilterFlow === 'expense') {
          if (tx.flowKind !== 'expense' && tx.flowKind !== 'refund') return false;
        } else if (tx.flowKind !== groupFilterFlow) {
          return false;
        }
      }
      if (q) {
        const hay = `${tx.merchantGroup} ${tx.rawDescription} ${tx.category} ${
          tx.documentId || ''
        } ${tx.operationType}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const dir = chronoSortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (chronoSortField === 'date') {
        const cmp = a.date.localeCompare(b.date);
        if (cmp !== 0) return cmp * dir;
        return (Math.abs(b.rawAmount) - Math.abs(a.rawAmount)) * dir;
      }
      if (chronoSortField === 'amount') {
        return (Math.abs(a.rawAmount) - Math.abs(b.rawAmount)) * dir;
      }
      if (chronoSortField === 'merchant') {
        return a.merchantGroup.localeCompare(b.merchantGroup, 'pt-BR') * dir;
      }
      return 0;
    });
  }, [
    currentStatement,
    groupFilterFlow,
    searchTerm,
    chronoSortField,
    chronoSortDir,
  ]);

  if (statements.monthly.length === 0) {
    return (
      <div className="p-8 text-center text-slate-400">
        Nenhum extrato de conta corrente encontrado em bankAccount/.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <MissingStatementsTracker
        files={files}
        allTransactions={allTransactions}
        onOpenUploadModal={() => onOpenUploadModal?.()}
        defaultExpanded={true}
      />

      {/* Horizontal Bank Statement Selector */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <Landmark className="w-5 h-5 text-emerald-400" />
            <h2 className="text-base font-bold text-white">
              Extratos da Conta Corrente Nubank ({statements.monthly.length} extratos mensais)
            </h2>
          </div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="text-xs text-slate-400 font-mono">
              Arquivo: bankAccount/{currentStatement.fileName}
            </span>
            {currentStatement.statementKey !== 'ALL' && onTogglePartialFile && (
              <button
                onClick={() =>
                  onTogglePartialFile(
                    'bankAccount',
                    currentStatement.fileName,
                    !partialBankFiles.has(currentStatement.fileName)
                  )
                }
                className={`px-2.5 py-1 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                  partialBankFiles.has(currentStatement.fileName)
                    ? 'bg-amber-500/20 border-amber-500/50 text-amber-200 hover:bg-amber-500/30'
                    : 'bg-slate-950 border-slate-800 text-slate-300 hover:text-amber-300 hover:border-amber-500/40'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>
                  {partialBankFiles.has(currentStatement.fileName)
                    ? 'Marcado como Parcial (Clique p/ Marcar Completo)'
                    : 'Marcar CSV como Parcial'}
                </span>
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2.5 overflow-x-auto pb-2">
          <button
            onClick={() => setSelectedStatementKey('ALL')}
            className={`px-4 py-2.5 rounded-xl border text-left shrink-0 transition cursor-pointer ${
              selectedStatementKey === 'ALL'
                ? 'bg-emerald-600/25 border-emerald-500 text-white shadow-lg'
                : 'bg-slate-950/70 border-slate-800 text-slate-300 hover:bg-slate-800/60'
            }`}
          >
            <div className="text-[11px] text-emerald-300 flex items-center gap-1 font-semibold">
              <Wallet className="w-3 h-3" />
              <span>Acumulado ({statements.monthly.length} meses)</span>
            </div>
            <div className="text-sm font-bold mt-0.5">
              +{formatBRL(statements.allBucket.totalIncome)}
            </div>
            <div className="text-[10px] text-slate-400">
              {statements.allBucket.items.length} lançamentos
            </div>
          </button>

          {statements.monthly.map((st) => {
            const isSelected = st.statementKey === selectedStatementKey;
            return (
              <button
                key={st.statementKey}
                onClick={() => setSelectedStatementKey(st.statementKey)}
                className={`px-4 py-2.5 rounded-xl border text-left shrink-0 transition cursor-pointer ${
                  isSelected
                    ? 'bg-emerald-600/25 border-emerald-500 text-white shadow-lg'
                    : 'bg-slate-950/70 border-slate-800 text-slate-300 hover:bg-slate-800/60'
                }`}
              >
                <div className="text-[11px] text-slate-400 flex items-center justify-between gap-1.5">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    <span>{formatMonthFull(st.month)}</span>
                  </span>
                  {partialBankFiles.has(st.fileName) && (
                    <span className="px-1.5 py-0.5 rounded bg-amber-500/25 border border-amber-500/50 text-[9px] font-bold text-amber-200 uppercase">
                      Parcial
                    </span>
                  )}
                </div>
                <div className="text-sm font-bold mt-0.5 text-emerald-300">
                  +{formatBRL(st.totalIncome)}
                </div>
                <div className="text-[10px] text-slate-400">
                  Saídas diretas: {formatBRL(st.directExpensesNet)}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected Statement KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Entradas / Receitas</span>
            <ArrowDownLeft className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-xl font-bold text-emerald-400 mt-1">
            {formatBRL(currentStatement.totalIncome)}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">
            Wise, PJ, Pix recebidos e Restituições
          </span>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Gastos Diretos na Conta</span>
            <ArrowUpRight className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-xl font-bold text-rose-300 mt-1">
            {formatBRL(currentStatement.directExpensesNet)}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">
            Pix enviados, Boletos e Débito
            {currentStatement.refundsTotal > 0
              ? ` (-${formatBRL(currentStatement.refundsTotal)} estornos)`
              : ''}
          </span>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Fatura do Cartão Paga</span>
            <CreditCard className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-xl font-bold text-sky-300 mt-1">
            {formatBRL(currentStatement.ccPaymentsTotal)}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">
            Quitado via saldo da conta corrente
          </span>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Movimentação RDB / CDB</span>
            <PiggyBank className="w-4 h-4 text-violet-400" />
          </div>
          <div className="text-sm font-bold text-violet-300 mt-1.5">
            Aplic.: {formatBRL(currentStatement.investmentsApplied)}
          </div>
          <div className="text-xs text-emerald-300 mt-0.5">
            Resgates: +{formatBRL(currentStatement.investmentsRedeemed)}
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Resultado Operacional</span>
            {currentStatement.operationalBalance >= 0 ? (
              <TrendingUp className="w-4 h-4 text-emerald-400" />
            ) : (
              <TrendingDown className="w-4 h-4 text-amber-400" />
            )}
          </div>
          <div
            className={`text-xl font-bold mt-1 ${
              currentStatement.operationalBalance >= 0
                ? 'text-emerald-400'
                : 'text-amber-300'
            }`}
          >
            {currentStatement.operationalBalance >= 0 ? '+' : ''}
            {formatBRL(currentStatement.operationalBalance)}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">
            Receitas menos (Gastos + Fatura)
          </span>
        </div>
      </div>

      {/* Main Content Box */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
        {/* Top Controls: View Switcher + Flow Filter + Search */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-white">
              Análise do Extrato ({currentStatement.items.length} movimentações)
            </h3>
            <p className="text-xs text-slate-400">
              Explore para onde foi o dinheiro (Pix, Boletos, Débito), quem enviou receitas e os pagamentos de fatura
            </p>
          </div>

          <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setViewMode('grouped')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
                viewMode === 'grouped'
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Por Favorecido / Origem ({groupedCounterparties.length})</span>
            </button>
            <button
              onClick={() => setViewMode('operations')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
                viewMode === 'operations'
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>Por Modalidade (Pix/Boleto/RDB)</span>
            </button>
            <button
              onClick={() => setViewMode('chronological')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
                viewMode === 'chronological'
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Receipt className="w-3.5 h-3.5" />
              <span>Extrato Completo ({chronologicalItems.length})</span>
            </button>
          </div>
        </div>

        {/* Filter Pills & Search Bar */}
        {viewMode !== 'operations' && (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800/70">
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: 'ALL', label: 'Tudo no Extrato' },
                  { id: 'expense', label: 'Saídas Diretas (Pix/Boleto/Débito)' },
                  { id: 'income', label: 'Entradas / Receitas' },
                  { id: 'cc_payment', label: 'Pagamento de Fatura' },
                  { id: 'investment', label: 'RDB / CDB' },
                ] as const
              ).map((pill) => (
                <button
                  key={pill.id}
                  onClick={() => setGroupFilterFlow(pill.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition cursor-pointer ${
                    groupFilterFlow === pill.id
                      ? 'bg-violet-600/25 border-violet-500 text-white'
                      : 'bg-slate-950/70 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {pill.label}
                </button>
              ))}
            </div>

            <div className="relative min-w-[240px] flex-1 max-w-xs">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar favorecido, CPF/CNPJ, Pix..."
                className="w-full pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>
        )}

        {/* VIEW 1: GROUPED BY COUNTERPARTY / ORIGIN */}
        {viewMode === 'grouped' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {groupedCounterparties.map((item) => {
              const isIncome = item.flowKind === 'income';
              const isCcPayment = item.flowKind === 'cc_payment';
              const isInvestment = item.flowKind === 'investment';

              return (
                <div
                  key={item.key}
                  className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center justify-between gap-3 hover:border-slate-700 transition"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-white text-sm truncate">
                        {item.merchantGroup}
                      </span>
                      <span className="text-xs text-slate-400">
                        ({item.items.length}x)
                      </span>
                      {item.documentId && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800">
                          {item.documentId}
                        </span>
                      )}
                    </div>

                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <span
                        className="px-2 py-0.5 rounded-full text-[10px] font-medium"
                        style={{
                          backgroundColor: `${getCategoryColor(item.category)}20`,
                          color: getCategoryColor(item.category),
                        }}
                      >
                        {item.category}
                      </span>
                      {Array.from(item.operationTypes).map((op) => (
                        <span
                          key={op}
                          className="px-2 py-0.5 rounded-md bg-slate-900 text-slate-400 text-[10px] border border-slate-800"
                        >
                          {op}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div
                      className={`text-sm font-bold ${
                        isIncome
                          ? 'text-emerald-400'
                          : isCcPayment
                          ? 'text-sky-300'
                          : isInvestment
                          ? 'text-violet-300'
                          : 'text-rose-300'
                      }`}
                    >
                      {isIncome ? '+' : '-'} {formatBRL(item.totalAmount)}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {item.flowKind === 'expense' &&
                      currentStatement.directExpensesNet > 0
                        ? `${(
                            (item.totalAmount / currentStatement.directExpensesNet) *
                            100
                          ).toFixed(1)}% dos gastos na conta`
                        : item.flowKind === 'income' &&
                          currentStatement.totalIncome > 0
                        ? `${(
                            (item.totalAmount / currentStatement.totalIncome) *
                            100
                          ).toFixed(1)}% das entradas`
                        : ''}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* VIEW 2: SUMMARY BY OPERATION TYPE */}
        {viewMode === 'operations' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {operationSummary.map((op) => {
              const isIncome = op.flowKind === 'income' || op.flowKind === 'refund';
              const isCc = op.flowKind === 'cc_payment';
              const isInv = op.flowKind === 'investment';
              return (
                <div
                  key={`${op.operationType}-${op.flowKind}`}
                  className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 flex flex-col justify-between"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-white">
                      {op.operationType}
                    </span>
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-900 border border-slate-800 text-slate-400">
                      {op.count} lançamentos
                    </span>
                  </div>
                  <div
                    className={`text-lg font-bold mt-2 ${
                      isIncome
                        ? 'text-emerald-400'
                        : isCc
                        ? 'text-sky-300'
                        : isInv
                        ? 'text-violet-300'
                        : 'text-rose-300'
                    }`}
                  >
                    {formatBRL(op.totalAmount)}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* VIEW 3: CHRONOLOGICAL STATEMENT TABLE */}
        {viewMode === 'chronological' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 uppercase">
                  <th
                    onClick={() => {
                      if (chronoSortField === 'date') {
                        setChronoSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
                      } else {
                        setChronoSortField('date');
                        setChronoSortDir('desc');
                      }
                    }}
                    className="py-2.5 px-3 cursor-pointer hover:text-white select-none"
                  >
                    <div className="inline-flex items-center gap-1">
                      <span>Data</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th
                    onClick={() => {
                      if (chronoSortField === 'merchant') {
                        setChronoSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
                      } else {
                        setChronoSortField('merchant');
                        setChronoSortDir('asc');
                      }
                    }}
                    className="py-2.5 px-3 cursor-pointer hover:text-white select-none"
                  >
                    <div className="inline-flex items-center gap-1">
                      <span>Favorecido / Origem</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th className="py-2.5 px-3">Descrição no Extrato</th>
                  <th className="py-2.5 px-3">Categoria</th>
                  <th className="py-2.5 px-3">Modalidade</th>
                  <th
                    onClick={() => {
                      if (chronoSortField === 'amount') {
                        setChronoSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
                      } else {
                        setChronoSortField('amount');
                        setChronoSortDir('desc');
                      }
                    }}
                    className="py-2.5 px-3 text-right cursor-pointer hover:text-white select-none"
                  >
                    <div className="inline-flex items-center justify-end gap-1">
                      <span>Valor</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {chronologicalItems.map((tx) => (
                  <tr key={tx.id} className="hover:bg-slate-800/40">
                    <td className="py-2.5 px-3 font-mono text-slate-300 whitespace-nowrap">
                      {formatDateBR(tx.date)}
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-white">
                      <div>{tx.merchantGroup}</div>
                      {tx.documentId && (
                        <div className="text-[10px] font-mono text-slate-500">
                          {tx.documentId}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-slate-300 max-w-md truncate">
                      {tx.rawDescription}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <span
                        className="px-2 py-0.5 rounded-full text-[10px] font-medium"
                        style={{
                          backgroundColor: `${getCategoryColor(tx.category)}20`,
                          color: getCategoryColor(tx.category),
                        }}
                      >
                        {tx.category}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-400 whitespace-nowrap">
                      {tx.operationType}
                    </td>
                    <td
                      className={`py-2.5 px-3 text-right font-semibold whitespace-nowrap ${
                        tx.flowKind === 'income' || tx.flowKind === 'refund'
                          ? 'text-emerald-400'
                          : tx.flowKind === 'cc_payment'
                          ? 'text-sky-400'
                          : tx.flowKind === 'investment'
                          ? 'text-violet-300'
                          : 'text-rose-300'
                      }`}
                    >
                      {tx.rawAmount >= 0
                        ? `+ ${formatBRL(tx.rawAmount)}`
                        : `- ${formatBRL(Math.abs(tx.rawAmount))}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
