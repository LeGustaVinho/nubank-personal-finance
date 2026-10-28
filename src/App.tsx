import React, { useEffect, useState, useMemo } from 'react';
import {
  LayoutDashboard,
  Layers,
  CreditCard,
  Landmark,
  Repeat,
  ListFilter,
  UploadCloud,
  RefreshCw,
  Calendar,
  WalletCards,
  BrainCircuit,
} from 'lucide-react';
import {
  UnifiedTransaction,
  CsvFileSummary,
  GroupingRule,
  TransactionOverride,
  LearnedPatternEntry,
  SmartSuggestion,
  BehavioralInsight,
  CostTypeOverrideValue,
  SourceType,
} from '../server/types';
import { AgyCliStatus, AgyAiBatchResult } from '../server/agyCliBridge';
import { formatMonthFull, formatMonthShort } from './utils/formatters';
import { DashboardView } from './components/DashboardView';
import { MerchantGroupsView } from './components/MerchantGroupsView';
import { CreditCardInvoicesView } from './components/CreditCardInvoicesView';
import { BankAccountStatementsView } from './components/BankAccountStatementsView';
import { RecurringAndInstallmentsView } from './components/RecurringAndInstallmentsView';
import { TransactionsExplorerView } from './components/TransactionsExplorerView';
import { IntelligencePatternsView } from './components/IntelligencePatternsView';
import { CsvManagerModal } from './components/CsvManagerModal';

type TabKey =
  | 'dashboard'
  | 'groups'
  | 'intelligence'
  | 'invoices'
  | 'bank_statements'
  | 'recurring'
  | 'explorer';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
  const [transactions, setTransactions] = useState<UnifiedTransaction[]>([]);
  const [files, setFiles] = useState<CsvFileSummary[]>([]);
  const [rules, setRules] = useState<GroupingRule[]>([]);
  const [learnedPatterns, setLearnedPatterns] = useState<LearnedPatternEntry[]>([]);
  const [smartSuggestions, setSmartSuggestions] = useState<SmartSuggestion[]>([]);
  const [behavioralInsights, setBehavioralInsights] = useState<BehavioralInsight[]>([]);
  const [agyStatus, setAgyStatus] = useState<AgyCliStatus | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [categoryBudgets, setCategoryBudgets] = useState<Record<string, number>>({});
  const [costTypeOverrides, setCostTypeOverrides] = useState<
    Record<string, CostTypeOverrideValue>
  >({});
  const [currentBankBalance, setCurrentBankBalance] = useState<number | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Global Filters & Toggles
  type PeriodPreset =
    | 'LIFETIME'
    | 'LAST_MONTH'
    | 'LAST_3_MONTHS'
    | 'LAST_YEAR'
    | 'SPECIFIC_MONTH'
    | 'DATE_RANGE';

  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('LIFETIME');
  const [specificMonth, setSpecificMonth] = useState<string>('');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [includeIof, setIncludeIof] = useState(true);
  const [netRefunds, setNetRefunds] = useState(true);
  const [focusedGroup, setFocusedGroup] = useState<string | null>(null);
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);

  const applyServerState = (data: any) => {
    setTransactions(data.transactions || []);
    setFiles(data.files || []);
    setRules(data.rules || []);
    setLearnedPatterns(data.learnedPatterns || []);
    setSmartSuggestions(data.smartSuggestions || []);
    setBehavioralInsights(data.behavioralInsights || []);
    if (data.agyStatus) setAgyStatus(data.agyStatus);
    setCategories(data.categories || []);
    setCategoryBudgets(data.categoryBudgets || {});
    setCostTypeOverrides(data.costTypeOverrides || {});
    setCurrentBankBalance(
      typeof data.currentBankBalance === 'number'
        ? data.currentBankBalance
        : null
    );
  };

  const fetchData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/data');
      if (!res.ok) throw new Error('Falha ao comunicar com a API local');
      const data = await res.json();
      applyServerState(data);
    } catch (err: any) {
      setError(err?.message || 'Erro ao carregar dados');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    for (const tx of transactions) {
      if (tx.competenceMonth) set.add(tx.competenceMonth);
    }
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [transactions]);

  const datasetDateBounds = useMemo(() => {
    if (transactions.length === 0) {
      return { minDate: '2026-01-01', maxDate: '2026-12-31' };
    }
    let minD = '9999-99-99';
    let maxD = '0000-00-00';
    for (const tx of transactions) {
      if (tx.date < minD) minD = tx.date;
      if (tx.date > maxD) maxD = tx.date;
    }
    return { minDate: minD, maxDate: maxD };
  }, [transactions]);

  useEffect(() => {
    if (availableMonths.length > 0 && !specificMonth) {
      setSpecificMonth(availableMonths[0]);
    }
  }, [availableMonths, specificMonth]);

  useEffect(() => {
    if (transactions.length > 0 && !customStartDate && !customEndDate) {
      setCustomStartDate(datasetDateBounds.minDate);
      setCustomEndDate(datasetDateBounds.maxDate);
    }
  }, [transactions.length, datasetDateBounds, customStartDate, customEndDate]);

  // Helper to shift a YYYY-MM string backward by N months
  const shiftYearMonth = (ym: string, deltaMonths: number): string => {
    const [yStr, mStr] = ym.split('-');
    const y = Number(yStr);
    const m = Number(mStr);
    if (Number.isNaN(y) || Number.isNaN(m)) return ym;
    const d = new Date(y, m - 1 + deltaMonths, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };

  const filteredTransactions = useMemo(() => {
    if (periodPreset === 'LIFETIME') return transactions;

    const latestMonth = availableMonths[0];
    if (periodPreset === 'LAST_MONTH') {
      if (!latestMonth) return transactions;
      return transactions.filter((tx) => tx.competenceMonth === latestMonth);
    }

    if (periodPreset === 'LAST_3_MONTHS') {
      if (!latestMonth) return transactions;
      const minMonth = shiftYearMonth(latestMonth, -2);
      return transactions.filter(
        (tx) => tx.competenceMonth >= minMonth && tx.competenceMonth <= latestMonth
      );
    }

    if (periodPreset === 'LAST_YEAR') {
      if (!latestMonth) return transactions;
      const minMonth = shiftYearMonth(latestMonth, -11);
      return transactions.filter(
        (tx) => tx.competenceMonth >= minMonth && tx.competenceMonth <= latestMonth
      );
    }

    if (periodPreset === 'SPECIFIC_MONTH') {
      const target = specificMonth || latestMonth;
      if (!target) return transactions;
      return transactions.filter((tx) => tx.competenceMonth === target);
    }

    if (periodPreset === 'DATE_RANGE') {
      return transactions.filter((tx) => {
        if (customStartDate && tx.date < customStartDate) return false;
        if (customEndDate && tx.date > customEndDate) return false;
        return true;
      });
    }

    return transactions;
  }, [
    transactions,
    periodPreset,
    availableMonths,
    specificMonth,
    customStartDate,
    customEndDate,
  ]);

  // Single-month equivalent for components that check if a single month is active (e.g. monthly budget progress)
  const effectiveSelectedMonth = useMemo(() => {
    if (periodPreset === 'LAST_MONTH') return availableMonths[0] || 'ALL';
    if (periodPreset === 'SPECIFIC_MONTH')
      return specificMonth || availableMonths[0] || 'ALL';
    return 'ALL';
  }, [periodPreset, availableMonths, specificMonth]);

  const handleSaveRule = async (
    rule: Partial<GroupingRule> & {
      merchantGroup: string;
      category: string;
      patterns: string[];
    }
  ) => {
    const res = await fetch('/api/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rule),
    });
    if (res.ok) {
      applyServerState(await res.json());
    }
  };

  const handleDeleteRule = async (ruleId: string) => {
    const res = await fetch(`/api/rules/${encodeURIComponent(ruleId)}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      applyServerState(await res.json());
    }
  };

  const handleOverrideTransaction = async (
    txId: string,
    override: TransactionOverride
  ) => {
    const res = await fetch(
      `/api/transactions/${encodeURIComponent(txId)}/override`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(override),
      }
    );
    if (res.ok) {
      applyServerState(await res.json());
    }
  };

  const handleCreateRuleFromTransaction = async (
    tx: UnifiedTransaction,
    newGroup: string,
    newCategory: string
  ) => {
    const pattern = tx.linkedTargetTitle || tx.extractedCounterparty;
    const res = await fetch('/api/learn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        merchantGroup: newGroup,
        category: newCategory,
        rawCounterparty: pattern,
        documentId: tx.documentId,
      }),
    });
    if (res.ok) {
      applyServerState(await res.json());
    }
  };

  const handleApproveSuggestion = async (sug: SmartSuggestion) => {
    const res = await fetch('/api/learn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        merchantGroup: sug.suggestedMerchantGroup,
        category: sug.suggestedCategory,
        rawCounterparty: sug.patternsToLearn[0] || sug.suggestedMerchantGroup,
        documentId: sug.documentIdsToLearn[0] || null,
        suggestionId: sug.id,
      }),
    });
    if (res.ok) {
      applyServerState(await res.json());
    }
  };

  const handleDismissSuggestion = async (sugId: string) => {
    const res = await fetch(`/api/suggestions/${encodeURIComponent(sugId)}/dismiss`, {
      method: 'POST',
    });
    if (res.ok) {
      applyServerState(await res.json());
    }
  };

  const handleDeleteLearnedPattern = async (id: string) => {
    const res = await fetch(`/api/learned/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      applyServerState(await res.json());
    }
  };

  const handleUpdateCostType = async (
    merchantGroup: string,
    costType: CostTypeOverrideValue | null
  ) => {
    const res = await fetch('/api/cost-types', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ merchantGroup, costType }),
    });
    if (res.ok) {
      applyServerState(await res.json());
    }
  };

  const handleUpdateBankBalance = async (balance: number | null) => {
    const res = await fetch('/api/bank-balance', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentBankBalance: balance }),
    });
    if (res.ok) {
      applyServerState(await res.json());
    }
  };

  const handleTogglePartialFile = async (
    source: SourceType,
    fileName: string,
    isPartial: boolean
  ) => {
    const res = await fetch('/api/files/partial', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source, fileName, isPartial }),
    });
    if (res.ok) {
      applyServerState(await res.json());
    }
  };

  const handleRunAgyClassify = async (params: {
    modelId: string;
    scope: 'unmatched_only' | 'all_merchants';
    autoApply: boolean;
  }): Promise<AgyAiBatchResult> => {
    const res = await fetch('/api/ai/classify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao executar Antigravity CLI');
    if (data.state) {
      applyServerState(data.state);
    }
    return data.aiResult;
  };

  const handleAskAgyAdvisor = async (params: {
    question: string;
    modelId: string;
  }) => {
    const res = await fetch('/api/ai/advisor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao consultar Antigravity CLI');
    return data;
  };

  const handleUploadFiles = async (
    uploadedFiles: Array<{ fileName: string; content: string }>,
    autoAiClassify: boolean
  ) => {
    const res = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: uploadedFiles, autoAiClassify }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro no upload');

    if (data.state) {
      applyServerState(data.state);
    }
    return {
      newTransactionsCount: data.newTransactionsCount,
      aiClassifiedCount: data.aiClassifiedCount,
      totalTransactions: data.totalTransactions,
      results: data.results,
    };
  };

  const navigateToGroup = (groupName?: string) => {
    if (groupName) {
      setFocusedGroup(groupName);
    }
    setActiveTab('groups');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-40 bg-slate-950/90 backdrop-blur-md border-b border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-4">
          {/* Brand Logo */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center shadow-lg shadow-violet-600/25">
              <WalletCards className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                <span>Finanças & Controle de Gastos</span>
                <span className="px-2 py-0.5 rounded-full bg-violet-500/15 border border-violet-500/30 text-[10px] font-semibold text-violet-300">
                  {transactions.length} lançamentos • {files.length} CSVs
                </span>
                {agyStatus?.available && (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-semibold text-emerald-300">
                    AI CLI Ativo (agy v{agyStatus.version})
                  </span>
                )}
              </h1>
              <p className="text-xs text-slate-400">
                Conta Corrente (bankAccount/) + Cartão de Crédito (creditCard/) + Antigravity/Gemini CLI
              </p>
            </div>
          </div>

          {/* Global Period Selector & Actions */}
          <div className="flex flex-wrap items-center gap-2.5">
            {activeTab !== 'invoices' && activeTab !== 'bank_statements' && (
              <div className="flex flex-wrap items-center gap-2 bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5">
                <div className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                  <span className="text-xs text-slate-400">Período:</span>
                  <select
                    value={periodPreset}
                    onChange={(e) => setPeriodPreset(e.target.value as PeriodPreset)}
                    className="bg-transparent text-xs font-semibold text-white focus:outline-none cursor-pointer"
                  >
                    <option value="LIFETIME" className="bg-slate-900">
                      Life Time — Todo o Histórico ({availableMonths.length} meses)
                    </option>
                    <option value="LAST_MONTH" className="bg-slate-900">
                      Último Mês ({availableMonths[0] ? formatMonthShort(availableMonths[0]) : 'Atual'})
                    </option>
                    <option value="LAST_3_MONTHS" className="bg-slate-900">
                      Últimos 3 Meses
                    </option>
                    <option value="LAST_YEAR" className="bg-slate-900">
                      Último Ano (12 meses)
                    </option>
                    <option value="SPECIFIC_MONTH" className="bg-slate-900">
                      Mês Específico...
                    </option>
                    <option value="DATE_RANGE" className="bg-slate-900">
                      Range entre Datas...
                    </option>
                  </select>
                </div>

                {/* Specific Month Secondary Selector */}
                {periodPreset === 'SPECIFIC_MONTH' && (
                  <div className="flex items-center gap-1.5 pl-2 border-l border-slate-700">
                    <select
                      value={specificMonth || availableMonths[0] || ''}
                      onChange={(e) => setSpecificMonth(e.target.value)}
                      className="bg-slate-950 border border-violet-500/40 rounded-lg px-2 py-1 text-xs font-semibold text-violet-200 focus:outline-none focus:border-violet-500 cursor-pointer"
                    >
                      {availableMonths.map((m) => (
                        <option key={m} value={m} className="bg-slate-900">
                          {formatMonthFull(m)} ({formatMonthShort(m)})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Custom Date Range Inputs */}
                {periodPreset === 'DATE_RANGE' && (
                  <div className="flex flex-wrap items-center gap-1.5 pl-2 border-l border-slate-700 text-xs">
                    <input
                      type="date"
                      value={customStartDate}
                      min={datasetDateBounds.minDate}
                      max={customEndDate || datasetDateBounds.maxDate}
                      onChange={(e) => setCustomStartDate(e.target.value)}
                      className="bg-slate-950 border border-violet-500/40 rounded-lg px-2 py-0.5 text-xs font-mono text-white focus:outline-none focus:border-violet-500"
                    />
                    <span className="text-slate-500">até</span>
                    <input
                      type="date"
                      value={customEndDate}
                      min={customStartDate || datasetDateBounds.minDate}
                      max={datasetDateBounds.maxDate}
                      onChange={(e) => setCustomEndDate(e.target.value)}
                      className="bg-slate-950 border border-violet-500/40 rounded-lg px-2 py-0.5 text-xs font-mono text-white focus:outline-none focus:border-violet-500"
                    />
                  </div>
                )}

                <span className="px-2 py-0.5 rounded-full bg-violet-500/15 text-[10px] font-mono font-semibold text-violet-300">
                  {filteredTransactions.length} lanç.
                </span>
              </div>
            )}

            <button
              onClick={() => setIsCsvModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold shadow-lg shadow-violet-600/20 transition cursor-pointer"
            >
              <UploadCloud className="w-4 h-4" />
              <span>Importar Novos CSVs ({files.length})</span>
            </button>

            <button
              onClick={fetchData}
              className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 transition cursor-pointer"
              title="Recarregar pastas bankAccount/ e creditCard/"
            >
              <RefreshCw
                className={`w-4 h-4 ${isLoading ? 'animate-spin text-violet-400' : ''}`}
              />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center gap-2 overflow-x-auto border-t border-slate-900/80 pt-2">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition whitespace-nowrap cursor-pointer ${
              activeTab === 'dashboard'
                ? 'border-violet-500 text-white bg-violet-500/10 rounded-t-xl'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <LayoutDashboard className="w-4 h-4" />
            <span>Dashboard Geral</span>
          </button>

          <button
            onClick={() => setActiveTab('recurring')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition whitespace-nowrap cursor-pointer ${
              activeTab === 'recurring'
                ? 'border-violet-500 text-white bg-violet-500/10 rounded-t-xl'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Repeat className="w-4 h-4 text-emerald-400" />
            <span>Assinaturas, Fixos & Variáveis</span>
          </button>

          <button
            onClick={() => setActiveTab('groups')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition whitespace-nowrap cursor-pointer ${
              activeTab === 'groups'
                ? 'border-violet-500 text-white bg-violet-500/10 rounded-t-xl'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Compras Agrupadas</span>
          </button>

          <button
            onClick={() => setActiveTab('invoices')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition whitespace-nowrap cursor-pointer ${
              activeTab === 'invoices'
                ? 'border-violet-500 text-white bg-violet-500/10 rounded-t-xl'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <CreditCard className="w-4 h-4" />
            <span>Faturas do Cartão ({files.filter((f) => f.source === 'creditCard').length})</span>
          </button>

          <button
            onClick={() => setActiveTab('bank_statements')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition whitespace-nowrap cursor-pointer ${
              activeTab === 'bank_statements'
                ? 'border-violet-500 text-white bg-violet-500/10 rounded-t-xl'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Landmark className="w-4 h-4 text-emerald-400" />
            <span>Extratos da Conta ({files.filter((f) => f.source === 'bankAccount').length})</span>
          </button>

          <button
            onClick={() => setActiveTab('intelligence')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition whitespace-nowrap cursor-pointer ${
              activeTab === 'intelligence'
                ? 'border-violet-500 text-white bg-violet-500/10 rounded-t-xl'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <BrainCircuit className="w-4 h-4 text-violet-400" />
            <span>IA (Antigravity CLI)</span>
          </button>

          <button
            onClick={() => setActiveTab('explorer')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition whitespace-nowrap cursor-pointer ${
              activeTab === 'explorer'
                ? 'border-violet-500 text-white bg-violet-500/10 rounded-t-xl'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <ListFilter className="w-4 h-4" />
            <span>Explorador</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
        {error && (
          <div className="mb-6 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
            <strong>Erro:</strong> {error}
          </div>
        )}

        {isLoading && transactions.length === 0 ? (
          <div className="py-20 text-center text-slate-400 text-sm">
            Carregando e agrupando arquivos CSV de bankAccount/ e creditCard/...
          </div>
        ) : (
          <>
            {activeTab === 'dashboard' && (
              <DashboardView
                transactions={filteredTransactions}
                allTransactions={transactions}
                files={files}
                selectedMonth={effectiveSelectedMonth}
                includeIof={includeIof}
                setIncludeIof={setIncludeIof}
                netRefunds={netRefunds}
                setNetRefunds={setNetRefunds}
                categoryBudgets={categoryBudgets}
                onSelectCategoryForDrilldown={() => {}}
                onNavigateToGroups={navigateToGroup}
                onOpenUploadModal={() => setIsCsvModalOpen(true)}
              />
            )}

            {activeTab === 'groups' && (
              <MerchantGroupsView
                transactions={filteredTransactions}
                allTransactions={transactions}
                rules={rules}
                categories={categories}
                focusedGroup={focusedGroup}
                onClearFocusedGroup={() => setFocusedGroup(null)}
                onSaveRule={handleSaveRule}
                onDeleteRule={handleDeleteRule}
              />
            )}

            {activeTab === 'intelligence' && (
              <IntelligencePatternsView
                transactions={filteredTransactions}
                rules={rules}
                learnedPatterns={learnedPatterns}
                smartSuggestions={smartSuggestions}
                behavioralInsights={behavioralInsights}
                agyStatus={agyStatus}
                onApproveSuggestion={handleApproveSuggestion}
                onDismissSuggestion={handleDismissSuggestion}
                onDeleteLearnedPattern={handleDeleteLearnedPattern}
                onRunAgyClassify={handleRunAgyClassify}
                onAskAgyAdvisor={handleAskAgyAdvisor}
              />
            )}

            {activeTab === 'invoices' && (
              <CreditCardInvoicesView
                allTransactions={transactions}
                files={files}
                onOpenUploadModal={() => setIsCsvModalOpen(true)}
                onTogglePartialFile={handleTogglePartialFile}
              />
            )}

            {activeTab === 'bank_statements' && (
              <BankAccountStatementsView
                allTransactions={transactions}
                files={files}
                onOpenUploadModal={() => setIsCsvModalOpen(true)}
                onTogglePartialFile={handleTogglePartialFile}
              />
            )}

            {activeTab === 'recurring' && (
              <RecurringAndInstallmentsView
                allTransactions={filteredTransactions}
                costTypeOverrides={costTypeOverrides}
                onUpdateCostType={handleUpdateCostType}
              />
            )}

            {activeTab === 'explorer' && (
              <TransactionsExplorerView
                transactions={filteredTransactions}
                allTransactions={transactions}
                categories={categories}
                currentBankBalance={currentBankBalance}
                onUpdateBankBalance={handleUpdateBankBalance}
                onOverrideTransaction={handleOverrideTransaction}
                onCreateRuleFromTransaction={handleCreateRuleFromTransaction}
              />
            )}
          </>
        )}
      </main>

      {/* CSV Import & Folder Sync Modal */}
      <CsvManagerModal
        isOpen={isCsvModalOpen}
        onClose={() => setIsCsvModalOpen(false)}
        files={files}
        onTogglePartialFile={handleTogglePartialFile}
        onUploadFiles={handleUploadFiles}
      />
    </div>
  );
};

export default App;
