import React, { useMemo, useState, useEffect } from 'react';
import {
  Search,
  Filter,
  Download,
  Edit3,
  Check,
  X,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Landmark,
  Save,
} from 'lucide-react';
import {
  UnifiedTransaction,
  SourceType,
  FlowKind,
  TransactionOverride,
} from '../../server/types';
import {
  formatBRL,
  formatDateBR,
  getCategoryColor,
} from '../utils/formatters';

interface TransactionsExplorerViewProps {
  transactions: UnifiedTransaction[];
  allTransactions: UnifiedTransaction[];
  categories: string[];
  currentBankBalance: number | null;
  onUpdateBankBalance: (balance: number | null) => Promise<void>;
  onOverrideTransaction: (
    txId: string,
    override: TransactionOverride
  ) => Promise<void>;
  onCreateRuleFromTransaction: (
    tx: UnifiedTransaction,
    newGroup: string,
    newCategory: string
  ) => Promise<void>;
}

type SortField =
  | 'date'
  | 'amount'
  | 'runningBalance'
  | 'merchantGroup'
  | 'category'
  | 'source'
  | 'rawDescription';

type SortDirection = 'asc' | 'desc';

export const TransactionsExplorerView: React.FC<
  TransactionsExplorerViewProps
> = ({
  transactions,
  allTransactions,
  categories,
  currentBankBalance,
  onUpdateBankBalance,
  onOverrideTransaction,
  onCreateRuleFromTransaction,
}) => {
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'ALL' | SourceType>('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [flowFilter, setFlowFilter] = useState<'ALL' | FlowKind>('ALL');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [page, setPage] = useState(1);
  const pageSize = 40;

  // Bank Balance Anchor Input State
  const [balanceInput, setBalanceInput] = useState<string>(
    currentBankBalance !== null ? currentBankBalance.toFixed(2).replace('.', ',') : ''
  );
  const [isSavingBalance, setIsSavingBalance] = useState(false);

  useEffect(() => {
    setBalanceInput(
      currentBankBalance !== null ? currentBankBalance.toFixed(2).replace('.', ',') : ''
    );
  }, [currentBankBalance]);

  const handleSaveBankBalance = async () => {
    setIsSavingBalance(true);
    try {
      const trimmed = balanceInput.trim();
      if (!trimmed) {
        await onUpdateBankBalance(null);
      } else {
        const cleaned = trimmed
          .replace(/R\$/gi, '')
          .replace(/\s+/g, '')
          .replace(/\./g, '')
          .replace(',', '.');
        const parsed = Number.parseFloat(cleaned);
        if (!Number.isNaN(parsed)) {
          await onUpdateBankBalance(Math.round(parsed * 100) / 100);
        }
      }
    } finally {
      setIsSavingBalance(false);
    }
  };

  /**
   * Calcula retroativamente o Saldo em Conta no momento de cada transação:
   * Partindo do Saldo Atual (`currentBankBalance`) após a última movimentação bancária:
   * - Para a transação mais recente T_0:
   *     balanceAfter = currentBankBalance
   *     balanceBefore = balanceAfter - T_0.rawAmount
   * - Para a transação anterior T_1:
   *     balanceAfter = balanceBefore(T_0)
   *     balanceBefore = balanceAfter - T_1.rawAmount
   */
  const runningBalanceInfo = useMemo(() => {
    const byTxId = new Map<
      string,
      { balanceAfter: number; balanceBefore: number }
    >();
    const closingByDate = new Map<string, number>();

    if (currentBankBalance === null || Number.isNaN(currentBankBalance)) {
      return { byTxId, closingByDate, latestBankDate: null as string | null };
    }

    // Filtra todas as transações da conta corrente e ordena da mais recente para a mais antiga
    const bankTxsDesc = allTransactions
      .filter((tx) => tx.source === 'bankAccount')
      .slice()
      .sort((a, b) => {
        if (a.date !== b.date) return b.date.localeCompare(a.date);
        if (
          typeof a.csvRowOrder === 'number' &&
          typeof b.csvRowOrder === 'number' &&
          a.csvRowOrder !== b.csvRowOrder
        ) {
          return b.csvRowOrder - a.csvRowOrder;
        }
        return b.id.localeCompare(a.id);
      });

    let cursorBalance = Math.round(currentBankBalance * 100) / 100;
    const latestBankDate = bankTxsDesc.length > 0 ? bankTxsDesc[0].date : null;

    for (const tx of bankTxsDesc) {
      const balanceAfter = cursorBalance;
      const balanceBefore = Math.round((balanceAfter - tx.rawAmount) * 100) / 100;
      byTxId.set(tx.id, { balanceAfter, balanceBefore });

      // O primeiro lançamento encontrado de cada data (como estamos descendo do mais novo para o mais antigo)
      // representa o saldo final daquele dia na conta corrente.
      if (!closingByDate.has(tx.date)) {
        closingByDate.set(tx.date, balanceAfter);
      }

      cursorBalance = balanceBefore;
    }

    return { byTxId, closingByDate, latestBankDate };
  }, [allTransactions, currentBankBalance]);

  const getTxRunningBalance = (
    tx: UnifiedTransaction
  ): {
    balanceAfter: number | null;
    balanceBefore: number | null;
    isCardReference: boolean;
  } => {
    if (currentBankBalance === null) {
      return { balanceAfter: null, balanceBefore: null, isCardReference: false };
    }
    const direct = runningBalanceInfo.byTxId.get(tx.id);
    if (direct) {
      return {
        balanceAfter: direct.balanceAfter,
        balanceBefore: direct.balanceBefore,
        isCardReference: false,
      };
    }

    // Para transações de cartão de crédito, busca o saldo de fechamento da conta na mesma data (ou data anterior mais próxima)
    const exactDate = runningBalanceInfo.closingByDate.get(tx.date);
    if (exactDate !== undefined) {
      return {
        balanceAfter: exactDate,
        balanceBefore: null,
        isCardReference: true,
      };
    }

    // Procura a data bancária anterior mais próxima
    let bestDate = '';
    let bestBal: number | null = null;
    for (const [d, bal] of runningBalanceInfo.closingByDate.entries()) {
      if (d <= tx.date && d > bestDate) {
        bestDate = d;
        bestBal = bal;
      }
    }
    return {
      balanceAfter: bestBal,
      balanceBefore: null,
      isCardReference: true,
    };
  };

  // Inline Editing State
  const [editingTxId, setEditingTxId] = useState<string | null>(null);
  const [editGroup, setEditGroup] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [applyToAllSimilar, setApplyToAllSimilar] = useState(true);

  const handleHeaderSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection(
        field === 'date' || field === 'amount' || field === 'runningBalance'
          ? 'desc'
          : 'asc'
      );
    }
    setPage(1);
  };

  const handleDropdownSortChange = (combinedValue: string) => {
    const [field, dir] = combinedValue.split(':') as [SortField, SortDirection];
    setSortField(field);
    setSortDirection(dir);
    setPage(1);
  };

  const filtered = useMemo(() => {
    const list = transactions.filter((tx) => {
      if (sourceFilter !== 'ALL' && tx.source !== sourceFilter) return false;
      if (categoryFilter !== 'ALL' && tx.category !== categoryFilter)
        return false;
      if (flowFilter !== 'ALL' && tx.flowKind !== flowFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const hay = `${tx.merchantGroup} ${tx.rawDescription} ${tx.category} ${tx.operationType} ${tx.sourceFile} ${tx.documentId || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const mult = sortDirection === 'asc' ? 1 : -1;

    return list.sort((a, b) => {
      if (sortField === 'date') {
        if (a.date !== b.date) return a.date.localeCompare(b.date) * mult;
        if (
          a.source === 'bankAccount' &&
          b.source === 'bankAccount' &&
          typeof a.csvRowOrder === 'number' &&
          typeof b.csvRowOrder === 'number' &&
          a.csvRowOrder !== b.csvRowOrder
        ) {
          return (a.csvRowOrder - b.csvRowOrder) * mult;
        }
        return (Math.abs(a.rawAmount) - Math.abs(b.rawAmount)) * mult;
      }
      if (sortField === 'amount') {
        const diff = Math.abs(a.rawAmount) - Math.abs(b.rawAmount);
        if (diff !== 0) return diff * mult;
        return b.date.localeCompare(a.date);
      }
      if (sortField === 'runningBalance') {
        const balA = getTxRunningBalance(a).balanceAfter ?? -Infinity;
        const balB = getTxRunningBalance(b).balanceAfter ?? -Infinity;
        if (balA !== balB) return (balA - balB) * mult;
        return b.date.localeCompare(a.date);
      }
      if (sortField === 'merchantGroup') {
        const cmp = a.merchantGroup.localeCompare(b.merchantGroup, 'pt-BR');
        if (cmp !== 0) return cmp * mult;
        return b.date.localeCompare(a.date);
      }
      if (sortField === 'category') {
        const cmp = a.category.localeCompare(b.category, 'pt-BR');
        if (cmp !== 0) return cmp * mult;
        return (Math.abs(b.rawAmount) - Math.abs(a.rawAmount));
      }
      if (sortField === 'source') {
        const cmp = a.source.localeCompare(b.source);
        if (cmp !== 0) return cmp * mult;
        return b.date.localeCompare(a.date);
      }
      if (sortField === 'rawDescription') {
        const cmp = a.rawDescription.localeCompare(b.rawDescription, 'pt-BR');
        if (cmp !== 0) return cmp * mult;
        return b.date.localeCompare(a.date);
      }
      return 0;
    });
  }, [
    transactions,
    sourceFilter,
    categoryFilter,
    flowFilter,
    search,
    sortField,
    sortDirection,
    runningBalanceInfo,
  ]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page]);

  const totals = useMemo(() => {
    let expenses = 0;
    let income = 0;
    for (const tx of filtered) {
      expenses += tx.expenseAmount;
      income += tx.incomeAmount;
    }
    return { expenses, income };
  }, [filtered]);

  const startEditing = (tx: UnifiedTransaction) => {
    setEditingTxId(tx.id);
    setEditGroup(tx.merchantGroup);
    setEditCategory(tx.category);
    setApplyToAllSimilar(true);
  };

  const saveEdit = async (tx: UnifiedTransaction) => {
    if (!editGroup.trim()) return;
    if (applyToAllSimilar) {
      await onCreateRuleFromTransaction(tx, editGroup.trim(), editCategory);
    } else {
      await onOverrideTransaction(tx.id, {
        merchantGroup: editGroup.trim(),
        category: editCategory,
      });
    }
    setEditingTxId(null);
  };

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3.5 h-3.5 text-slate-600 group-hover:text-slate-400" />;
    }
    return sortDirection === 'asc' ? (
      <ArrowUp className="w-3.5 h-3.5 text-violet-400" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 text-violet-400" />
    );
  };

  const exportFilteredToCsv = () => {
    const headers = [
      'Data',
      'Origem',
      'Arquivo',
      'Grupo Estabelecimento',
      'Categoria',
      'Tipo Operacao',
      'Fluxo',
      'Valor',
      'Saldo em Conta Apos Transacao',
      'Saldo em Conta Antes Transacao',
      'Descricao Original',
    ];
    const rows = filtered.map((tx) => {
      const bal = getTxRunningBalance(tx);
      return [
        tx.date,
        tx.source === 'creditCard' ? 'Cartão de Crédito' : 'Conta Corrente',
        tx.sourceFile,
        `"${tx.merchantGroup.replace(/"/g, '""')}"`,
        `"${tx.category.replace(/"/g, '""')}"`,
        `"${tx.operationType.replace(/"/g, '""')}"`,
        tx.flowKind,
        tx.signedCashflow.toFixed(2),
        bal.balanceAfter !== null ? bal.balanceAfter.toFixed(2) : '',
        bal.balanceBefore !== null ? bal.balanceBefore.toFixed(2) : '',
        `"${tx.rawDescription.replace(/"/g, '""')}"`,
      ];
    });

    const csvContent =
      '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `transacoes_filtradas_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      {/* Filter & Sort Controls Card */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-violet-400" />
            <div>
              <h2 className="text-base font-bold text-white">
                Explorador Completo de Transações ({filtered.length} registros)
              </h2>
              <p className="text-xs text-slate-400">
                Filtre, pesquise e clique em qualquer coluna da tabela (ou no seletor abaixo) para ordenar os resultados
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs">
            <div className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-slate-400 mr-1.5">Despesas no filtro:</span>
              <span className="font-bold text-rose-400">
                {formatBRL(totals.expenses)}
              </span>
            </div>
            <div className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-slate-400 mr-1.5">Receitas no filtro:</span>
              <span className="font-bold text-emerald-400">
                {formatBRL(totals.income)}
              </span>
            </div>
            <button
              onClick={exportFilteredToCsv}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-medium cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Exportar CSV</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3">
          {/* Search Input */}
          <div className="lg:col-span-4 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Pesquisar texto, CNPJ, pessoa, loja..."
              className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-violet-500"
            />
            {search && (
              <button
                onClick={() => {
                  setSearch('');
                  setPage(1);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white cursor-pointer"
              >
                Limpar
              </button>
            )}
          </div>

          {/* Origin Filter */}
          <div className="lg:col-span-2">
            <select
              value={sourceFilter}
              onChange={(e) => {
                setSourceFilter(e.target.value as any);
                setPage(1);
              }}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-violet-500"
            >
              <option value="ALL">Origem: Conta + Cartão</option>
              <option value="creditCard">Apenas Cartão</option>
              <option value="bankAccount">Apenas Conta</option>
            </select>
          </div>

          {/* Category Filter */}
          <div className="lg:col-span-2">
            <select
              value={categoryFilter}
              onChange={(e) => {
                setCategoryFilter(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-violet-500"
            >
              <option value="ALL">Todas Categorias</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* Flow Type Filter */}
          <div className="lg:col-span-2">
            <select
              value={flowFilter}
              onChange={(e) => {
                setFlowFilter(e.target.value as any);
                setPage(1);
              }}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-violet-500"
            >
              <option value="ALL">Todos os Tipos</option>
              <option value="expense">Compras / Despesas</option>
              <option value="income">Receitas / Entradas</option>
              <option value="iof">IOF Internacional</option>
              <option value="refund">Estornos / Reembolsos</option>
              <option value="investment">RDB / Investimentos</option>
              <option value="cc_payment">Pagamento Fatura</option>
            </select>
          </div>

          {/* Sort Dropdown */}
          <div className="lg:col-span-2">
            <select
              value={`${sortField}:${sortDirection}`}
              onChange={(e) => handleDropdownSortChange(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-violet-500/40 rounded-xl text-xs font-medium text-violet-200 focus:outline-none focus:border-violet-500"
            >
              <option value="date:desc">Ordenar: Data (Mais recentes)</option>
              <option value="date:asc">Ordenar: Data (Mais antigas)</option>
              <option value="amount:desc">Ordenar: Maior Valor</option>
              <option value="amount:asc">Ordenar: Menor Valor</option>
              <option value="runningBalance:desc">
                Ordenar: Maior Saldo em Conta
              </option>
              <option value="runningBalance:asc">
                Ordenar: Menor Saldo em Conta
              </option>
              <option value="merchantGroup:asc">Ordenar: Estabelecimento (A–Z)</option>
              <option value="merchantGroup:desc">Ordenar: Estabelecimento (Z–A)</option>
              <option value="category:asc">Ordenar: Categoria (A–Z)</option>
              <option value="category:desc">Ordenar: Categoria (Z–A)</option>
              <option value="source:asc">Ordenar: Origem (Conta/Cartão)</option>
            </select>
          </div>
        </div>

        {/* Current Bank Balance Anchor Bar */}
        <div className="pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-400 shrink-0">
              <Landmark className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-semibold text-white flex items-center gap-2">
                <span>Saldo Atual em Conta Corrente (Âncora Retroativa)</span>
                {currentBankBalance !== null && (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-bold text-emerald-300">
                    Ativo: {formatBRL(currentBankBalance)}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400">
                Informe quanto você tem disponível na conta hoje{runningBalanceInfo.latestBankDate ? ` (após o último lançamento em ${formatDateBR(runningBalanceInfo.latestBankDate)})` : ''} para reconstruir a coluna{' '}
                <strong className="text-slate-200">Saldo em Conta (no Momento)</strong> em todas as transações.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <span className="text-xs font-semibold text-slate-400 absolute left-3 top-1/2 -translate-y-1/2">
                R$
              </span>
              <input
                type="text"
                value={balanceInput}
                onChange={(e) => setBalanceInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveBankBalance();
                }}
                placeholder="Ex: 4250,80"
                className="w-40 pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-700 rounded-xl text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
              />
            </div>
            <button
              onClick={handleSaveBankBalance}
              disabled={isSavingBalance}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-semibold transition cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isSavingBalance ? 'Salvando...' : 'Atualizar Saldo'}</span>
            </button>
            {currentBankBalance !== null && (
              <button
                onClick={async () => {
                  setBalanceInput('');
                  await onUpdateBankBalance(null);
                }}
                className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition cursor-pointer"
                title="Limpar saldo informado"
              >
                Limpar
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Transactions Table with Sortable Headers */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl shadow-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 uppercase select-none">
                <th
                  onClick={() => handleHeaderSort('date')}
                  className="py-3 px-3 cursor-pointer hover:text-white transition group"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Data</span>
                    {renderSortIcon('date')}
                  </div>
                </th>
                <th
                  onClick={() => handleHeaderSort('source')}
                  className="py-3 px-3 cursor-pointer hover:text-white transition group"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Origem</span>
                    {renderSortIcon('source')}
                  </div>
                </th>
                <th
                  onClick={() => handleHeaderSort('merchantGroup')}
                  className="py-3 px-3 cursor-pointer hover:text-white transition group"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Grupo / Estabelecimento</span>
                    {renderSortIcon('merchantGroup')}
                  </div>
                </th>
                <th
                  onClick={() => handleHeaderSort('category')}
                  className="py-3 px-3 cursor-pointer hover:text-white transition group"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Categoria</span>
                    {renderSortIcon('category')}
                  </div>
                </th>
                <th
                  onClick={() => handleHeaderSort('rawDescription')}
                  className="py-3 px-3 cursor-pointer hover:text-white transition group"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Operação & Descrição Original</span>
                    {renderSortIcon('rawDescription')}
                  </div>
                </th>
                <th
                  onClick={() => handleHeaderSort('amount')}
                  className="py-3 px-3 text-right cursor-pointer hover:text-white transition group"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>Valor</span>
                    {renderSortIcon('amount')}
                  </div>
                </th>
                <th
                  onClick={() => handleHeaderSort('runningBalance')}
                  className="py-3 px-3 text-right cursor-pointer hover:text-white transition group"
                  title="Saldo em conta corrente após este lançamento (e saldo anterior logo abaixo)"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>Saldo em Conta (no Momento)</span>
                    {renderSortIcon('runningBalance')}
                  </div>
                </th>
                <th className="py-3 px-3 text-center">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {paginated.map((tx) => {
                const isEditing = editingTxId === tx.id;
                return (
                  <tr key={tx.id} className="hover:bg-slate-800/40">
                    <td className="py-3 px-3 font-mono text-slate-300 whitespace-nowrap">
                      {formatDateBR(tx.date)}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                          tx.source === 'creditCard'
                            ? 'bg-violet-500/15 text-violet-300'
                            : 'bg-sky-500/15 text-sky-300'
                        }`}
                      >
                        {tx.source === 'creditCard' ? 'Cartão' : 'Conta'}
                      </span>
                    </td>

                    {/* Group Column */}
                    <td className="py-3 px-3 font-semibold text-white">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editGroup}
                          onChange={(e) => setEditGroup(e.target.value)}
                          className="px-2 py-1 bg-slate-950 border border-violet-500 rounded text-xs text-white w-44"
                        />
                      ) : (
                        tx.merchantGroup
                      )}
                    </td>

                    {/* Category Column */}
                    <td className="py-3 px-3">
                      {isEditing ? (
                        <div className="space-y-1">
                          <select
                            value={editCategory}
                            onChange={(e) => setEditCategory(e.target.value)}
                            className="px-2 py-1 bg-slate-950 border border-violet-500 rounded text-xs text-white"
                          >
                            {categories.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                          <label className="flex items-center gap-1 text-[10px] text-slate-300">
                            <input
                              type="checkbox"
                              checked={applyToAllSimilar}
                              onChange={(e) =>
                                setApplyToAllSimilar(e.target.checked)
                              }
                            />
                            <span>Aplicar a similares</span>
                          </label>
                        </div>
                      ) : (
                        <span
                          className="px-2.5 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap"
                          style={{
                            backgroundColor: `${getCategoryColor(tx.category)}20`,
                            color: getCategoryColor(tx.category),
                          }}
                        >
                          {tx.category}
                        </span>
                      )}
                    </td>

                    {/* Description Column */}
                    <td className="py-3 px-3 max-w-md">
                      <div
                        className="text-slate-200 truncate"
                        title={tx.rawDescription}
                      >
                        {tx.rawDescription}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono truncate">
                        {tx.operationType} • {tx.sourceFile}
                      </div>
                    </td>

                    {/* Amount Column */}
                    <td
                      className={`py-3 px-3 text-right font-semibold whitespace-nowrap ${
                        tx.flowKind === 'income' || tx.flowKind === 'refund'
                          ? 'text-emerald-400'
                          : tx.flowKind === 'cc_payment' ||
                            tx.flowKind === 'investment'
                          ? 'text-slate-400'
                          : tx.flowKind === 'iof'
                          ? 'text-amber-300'
                          : 'text-rose-300'
                      }`}
                    >
                      {tx.flowKind === 'income'
                        ? `+ ${formatBRL(tx.incomeAmount)}`
                        : tx.flowKind === 'refund'
                        ? `- ${formatBRL(Math.abs(tx.rawAmount))}`
                        : formatBRL(Math.abs(tx.rawAmount))}
                    </td>

                    {/* Running Balance Column */}
                    <td className="py-3 px-3 text-right whitespace-nowrap">
                      {(() => {
                        const bal = getTxRunningBalance(tx);
                        if (bal.balanceAfter === null) {
                          return (
                            <span
                              className="text-[11px] text-slate-600 italic"
                              title="Informe seu Saldo Atual em Conta acima para calcular"
                            >
                              Informe o saldo acima
                            </span>
                          );
                        }
                        if (bal.isCardReference) {
                          return (
                            <div
                              title="Transação no Cartão de Crédito — exibe o saldo de fechamento da Conta Corrente nesta data"
                              className="text-right"
                            >
                              <div className="font-mono text-[11px] text-slate-400">
                                {formatBRL(bal.balanceAfter)}
                              </div>
                              <div className="text-[9px] text-slate-500">
                                saldo na conta no dia
                              </div>
                            </div>
                          );
                        }
                        return (
                          <div
                            title={`Antes: ${formatBRL(bal.balanceBefore ?? 0)} → Depois: ${formatBRL(bal.balanceAfter)}`}
                            className="text-right"
                          >
                            <div
                              className={`font-mono font-bold text-xs ${
                                bal.balanceAfter >= 0
                                  ? 'text-sky-300'
                                  : 'text-rose-400'
                              }`}
                            >
                              {formatBRL(bal.balanceAfter)}
                            </div>
                            {bal.balanceBefore !== null && (
                              <div className="text-[10px] font-mono text-slate-500">
                                antes: {formatBRL(bal.balanceBefore)}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </td>

                    {/* Actions Column */}
                    <td className="py-3 px-3 text-center whitespace-nowrap">
                      {isEditing ? (
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => saveEdit(tx)}
                            className="p-1 rounded bg-emerald-600 text-white hover:bg-emerald-500 cursor-pointer"
                            title="Salvar"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setEditingTxId(null)}
                            className="p-1 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 cursor-pointer"
                            title="Cancelar"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => startEditing(tx)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                          title="Editar Grupo / Categoria"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="px-4 py-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <span>
            Exibindo {filtered.length > 0 ? (page - 1) * pageSize + 1 : 0}–
            {Math.min(page * pageSize, filtered.length)} de {filtered.length}{' '}
            lançamentos
          </span>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1 rounded-lg bg-slate-800 disabled:opacity-40 text-slate-200 cursor-pointer"
            >
              Anterior
            </button>
            <span className="text-slate-300 font-medium">
              Página {page} de {totalPages}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="px-3 py-1 rounded-lg bg-slate-800 disabled:opacity-40 text-slate-200 cursor-pointer"
            >
              Próxima
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
