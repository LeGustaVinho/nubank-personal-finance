import React, { useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  ComposedChart,
  Line,
  ReferenceLine,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  CreditCard,
  Landmark,
  PiggyBank,
  ArrowUpRight,
  Layers,
  CheckCircle2,
  Receipt,
  Sparkles,
  BarChart3,
  Scale,
  AlertTriangle,
  Check,
} from 'lucide-react';
import { CsvFileSummary, UnifiedTransaction } from '../../server/types';
import {
  formatBRL,
  formatCompactBRL,
  formatMonthShort,
  formatMonthFull,
  formatDateBR,
  getCategoryColor,
} from '../utils/formatters';
import { MissingStatementsTracker } from './MissingStatementsTracker';

interface DashboardViewProps {
  transactions: UnifiedTransaction[];
  allTransactions: UnifiedTransaction[];
  files?: CsvFileSummary[];
  selectedMonth: string; // 'ALL' or 'YYYY-MM'
  includeIof: boolean;
  setIncludeIof: (v: boolean) => void;
  netRefunds: boolean;
  setNetRefunds: (v: boolean) => void;
  categoryBudgets: Record<string, number>;
  onSelectCategoryForDrilldown: (category: string) => void;
  onNavigateToGroups: (groupName?: string) => void;
  onOpenUploadModal?: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  transactions,
  allTransactions,
  files = [],
  selectedMonth,
  includeIof,
  setIncludeIof,
  netRefunds,
  setNetRefunds,
  categoryBudgets,
  onNavigateToGroups,
  onOpenUploadModal,
}) => {
  // Regime for unified monthly balance: 'competence' (purchase date) or 'invoice' (credit card invoice month)
  const [accountingRegime, setAccountingRegime] = useState<'competence' | 'invoice'>(
    'competence'
  );

  const getEffectiveExpense = (tx: UnifiedTransaction): number => {
    if (tx.flowKind === 'expense') return Math.abs(tx.rawAmount);
    if (tx.flowKind === 'iof') return includeIof ? Math.abs(tx.rawAmount) : 0;
    if (tx.flowKind === 'refund') return netRefunds ? -Math.abs(tx.rawAmount) : 0;
    return 0;
  };

  // All distinct expense categories across all transactions
  const allExpenseCategories = useMemo(() => {
    const map = new Map<string, number>();
    for (const tx of allTransactions) {
      const exp = getEffectiveExpense(tx);
      if (exp !== 0) {
        map.set(tx.category, (map.get(tx.category) || 0) + exp);
      }
    }
    return Array.from(map.entries())
      .filter(([, total]) => total > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([cat]) => cat);
  }, [allTransactions, includeIof, netRefunds]);

  // Selected category for the Monthly Category Chart (defaults to top category)
  const [selectedCategoryChart, setSelectedCategoryChart] = useState<string>('');
  const effectiveSelectedCategory =
    selectedCategoryChart && allExpenseCategories.includes(selectedCategoryChart)
      ? selectedCategoryChart
      : allExpenseCategories[0] || '';

  // KPIs Calculation for filtered period
  const kpis = useMemo(() => {
    let totalIncome = 0;
    let totalExpenses = 0;
    let ccExpenses = 0;
    let bankExpenses = 0;
    let totalIof = 0;
    let totalRefunds = 0;
    let investmentsApplied = 0;
    let investmentsRedeemed = 0;
    let ccPaymentsTotal = 0;

    for (const tx of transactions) {
      if (tx.flowKind === 'income') {
        totalIncome += tx.incomeAmount;
      }
      const exp = getEffectiveExpense(tx);
      if (exp !== 0) {
        totalExpenses += exp;
        if (tx.source === 'creditCard') ccExpenses += exp;
        else bankExpenses += exp;
      }
      if (tx.flowKind === 'iof') {
        totalIof += Math.abs(tx.rawAmount);
      }
      if (tx.flowKind === 'refund') {
        totalRefunds += Math.abs(tx.rawAmount);
      }
      if (tx.flowKind === 'investment') {
        if (tx.rawAmount < 0) investmentsApplied += Math.abs(tx.rawAmount);
        else investmentsRedeemed += tx.rawAmount;
      }
      if (tx.flowKind === 'cc_payment' && tx.source === 'bankAccount') {
        ccPaymentsTotal += Math.abs(tx.rawAmount);
      }
    }

    const netSavings = totalIncome - totalExpenses;
    const savingsRate = totalIncome > 0 ? (netSavings / totalIncome) * 100 : 0;
    const committedRatio = totalIncome > 0 ? (totalExpenses / totalIncome) * 100 : 0;

    return {
      totalIncome,
      totalExpenses,
      ccExpenses,
      bankExpenses,
      totalIof,
      totalRefunds,
      investmentsApplied,
      investmentsRedeemed,
      netInvestmentFlow: investmentsApplied - investmentsRedeemed,
      ccPaymentsTotal,
      netSavings,
      savingsRate,
      committedRatio,
    };
  }, [transactions, includeIof, netRefunds]);

  // Unified Monthly Series (Credit Card + Bank Account vs Income)
  const monthlySeries = useMemo(() => {
    const map = new Map<
      string,
      {
        month: string;
        label: string;
        fullLabel: string;
        Receitas: number;
        Cartao: number;
        Conta: number;
        TotalDespesas: number;
        Saldo: number;
        hasBankTx: boolean;
        hasCcTx: boolean;
      }
    >();

    for (const tx of allTransactions) {
      const m =
        accountingRegime === 'invoice' && tx.source === 'creditCard' && tx.invoiceMonth
          ? tx.invoiceMonth
          : tx.competenceMonth;
      if (!m) continue;

      if (!map.has(m)) {
        map.set(m, {
          month: m,
          label: formatMonthShort(m),
          fullLabel: formatMonthFull(m),
          Receitas: 0,
          Cartao: 0,
          Conta: 0,
          TotalDespesas: 0,
          Saldo: 0,
          hasBankTx: false,
          hasCcTx: false,
        });
      }
      const entry = map.get(m)!;
      if (tx.source === 'bankAccount') entry.hasBankTx = true;
      if (tx.source === 'creditCard') entry.hasCcTx = true;

      if (tx.flowKind === 'income') {
        entry.Receitas += tx.incomeAmount;
      }
      const exp = getEffectiveExpense(tx);
      if (exp !== 0) {
        if (tx.source === 'creditCard') entry.Cartao += exp;
        else entry.Conta += exp;
        entry.TotalDespesas += exp;
      }
    }

    let runningBalance = 0;
    return Array.from(map.values())
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((item) => {
        const Receitas = Math.round(item.Receitas * 100) / 100;
        const Cartao = Math.round(item.Cartao * 100) / 100;
        const Conta = Math.round(item.Conta * 100) / 100;
        const TotalDespesas = Math.round(item.TotalDespesas * 100) / 100;
        const Saldo = Math.round((Receitas - TotalDespesas) * 100) / 100;
        runningBalance = Math.round((runningBalance + Saldo) * 100) / 100;
        const spentRatio = Receitas > 0 ? (TotalDespesas / Receitas) * 100 : 0;

        return {
          ...item,
          Receitas,
          Cartao,
          Conta,
          TotalDespesas,
          Saldo,
          SaldoAcumulado: runningBalance,
          spentRatio,
          spentMoreThanEarned: TotalDespesas > Receitas,
        };
      });
  }, [allTransactions, includeIof, netRefunds, accountingRegime]);

  // Summary of months in surplus vs deficit (only considering months where bank statement is present)
  const unifiedBalanceOverview = useMemo(() => {
    const completeMonths = monthlySeries.filter((m) => m.hasBankTx);
    const surplusMonths = completeMonths.filter((m) => m.Saldo >= 0);
    const deficitMonths = completeMonths.filter((m) => m.Saldo < 0);
    const incompleteMonths = monthlySeries.filter((m) => !m.hasBankTx);

    const totalCompleteIncome = completeMonths.reduce((s, m) => s + m.Receitas, 0);
    const totalCompleteExpenses = completeMonths.reduce((s, m) => s + m.TotalDespesas, 0);
    const totalCompleteBalance = totalCompleteIncome - totalCompleteExpenses;

    return {
      completeMonthsCount: completeMonths.length,
      surplusCount: surplusMonths.length,
      deficitCount: deficitMonths.length,
      incompleteMonths,
      totalCompleteIncome,
      totalCompleteExpenses,
      totalCompleteBalance,
    };
  }, [monthlySeries]);

  // Category Breakdown for selected period
  const categoryBreakdown = useMemo(() => {
    const map = new Map<
      string,
      { category: string; amount: number; count: number; color: string }
    >();

    for (const tx of transactions) {
      const exp = getEffectiveExpense(tx);
      if (exp === 0) continue;
      const cat = tx.category;
      if (!map.has(cat)) {
        map.set(cat, {
          category: cat,
          amount: 0,
          count: 0,
          color: getCategoryColor(cat),
        });
      }
      const entry = map.get(cat)!;
      entry.amount += exp;
      if (tx.flowKind === 'expense') entry.count += 1;
    }

    const total = Array.from(map.values()).reduce(
      (acc, v) => acc + Math.max(0, v.amount),
      0
    );
    return Array.from(map.values())
      .filter((v) => v.amount > 0)
      .sort((a, b) => b.amount - a.amount)
      .map((v) => ({
        ...v,
        amount: Math.round(v.amount * 100) / 100,
        percentage: total > 0 ? (v.amount / total) * 100 : 0,
      }));
  }, [transactions, includeIof, netRefunds]);

  // Monthly Evolution for the SELECTED Category across all months
  const selectedCategoryMonthlyAnalysis = useMemo(() => {
    const allMonthsSet = new Set<string>();
    for (const tx of allTransactions) {
      if (tx.competenceMonth) allMonthsSet.add(tx.competenceMonth);
    }
    const sortedMonths = Array.from(allMonthsSet).sort((a, b) => a.localeCompare(b));

    const monthMap = new Map<
      string,
      {
        month: string;
        label: string;
        fullLabel: string;
        Cartao: number;
        Conta: number;
        Total: number;
        count: number;
      }
    >();

    for (const m of sortedMonths) {
      monthMap.set(m, {
        month: m,
        label: formatMonthShort(m),
        fullLabel: formatMonthFull(m),
        Cartao: 0,
        Conta: 0,
        Total: 0,
        count: 0,
      });
    }

    const merchantTotals = new Map<
      string,
      { merchantGroup: string; total: number; count: number; cc: number; bank: number }
    >();
    const categoryTxs: UnifiedTransaction[] = [];

    for (const tx of allTransactions) {
      if (tx.category !== effectiveSelectedCategory) continue;
      const exp = getEffectiveExpense(tx);
      if (exp === 0) continue;

      categoryTxs.push(tx);
      const m = tx.competenceMonth;
      const entry = monthMap.get(m);
      if (entry) {
        if (tx.source === 'creditCard') entry.Cartao += exp;
        else entry.Conta += exp;
        entry.Total += exp;
        if (tx.flowKind === 'expense') entry.count += 1;
      }

      const g = tx.merchantGroup;
      if (!merchantTotals.has(g)) {
        merchantTotals.set(g, {
          merchantGroup: g,
          total: 0,
          count: 0,
          cc: 0,
          bank: 0,
        });
      }
      const mEntry = merchantTotals.get(g)!;
      mEntry.total += exp;
      if (tx.flowKind === 'expense') mEntry.count += 1;
      if (tx.source === 'creditCard') mEntry.cc += exp;
      else mEntry.bank += exp;
    }

    const series = Array.from(monthMap.values()).map((item) => ({
      ...item,
      Cartao: Math.round(item.Cartao * 100) / 100,
      Conta: Math.round(item.Conta * 100) / 100,
      Total: Math.round(item.Total * 100) / 100,
    }));

    const activeMonths = series.filter((s) => s.Total > 0);
    const grandTotal = series.reduce((acc, s) => acc + s.Total, 0);
    const averageActiveMonth =
      activeMonths.length > 0 ? grandTotal / activeMonths.length : 0;
    const peakMonth =
      activeMonths.length > 0
        ? [...activeMonths].sort((a, b) => b.Total - a.Total)[0]
        : null;
    const topMerchants = Array.from(merchantTotals.values())
      .filter((m) => m.total > 0)
      .sort((a, b) => b.total - a.total);

    return {
      series,
      grandTotal,
      averageActiveMonth,
      activeMonthsCount: activeMonths.length,
      peakMonth,
      topMerchants,
      transactions: categoryTxs.sort(
        (a, b) => b.date.localeCompare(a.date) || Math.abs(b.rawAmount) - Math.abs(a.rawAmount)
      ),
    };
  }, [allTransactions, effectiveSelectedCategory, includeIof, netRefunds]);

  // Top Merchant Groups in current period
  const topMerchantGroups = useMemo(() => {
    const map = new Map<
      string,
      {
        merchantGroup: string;
        category: string;
        amount: number;
        count: number;
        ccAmount: number;
        bankAmount: number;
      }
    >();

    for (const tx of transactions) {
      const exp = getEffectiveExpense(tx);
      if (exp === 0) continue;
      const g = tx.merchantGroup;
      if (!map.has(g)) {
        map.set(g, {
          merchantGroup: g,
          category: tx.category,
          amount: 0,
          count: 0,
          ccAmount: 0,
          bankAmount: 0,
        });
      }
      const item = map.get(g)!;
      item.amount += exp;
      if (tx.flowKind === 'expense') item.count += 1;
      if (tx.source === 'creditCard') item.ccAmount += exp;
      else item.bankAmount += exp;
    }

    return Array.from(map.values())
      .filter((g) => g.amount > 0)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10);
  }, [transactions, includeIof, netRefunds]);

  return (
    <div className="space-y-6">
      {/* 1. Missing Statements & Invoices Year Coverage Tracker */}
      <MissingStatementsTracker
        files={files}
        allTransactions={allTransactions}
        onOpenUploadModal={() => onOpenUploadModal?.()}
        defaultExpanded={true}
      />

      {/* Calculation Toggles & Deduplication Status Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/80 border border-slate-800 rounded-xl px-4 py-3">
        <div className="flex items-center gap-2 text-xs text-slate-300">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>
            <strong>Proteção contra Dupla Contagem Ativa:</strong>{' '}
            {formatBRL(kpis.ccPaymentsTotal)} em <em>Pagamento de fatura</em> ocultos das
            despesas (pois cada compra já é contabilizada no cartão).
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setIncludeIof(!includeIof)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition cursor-pointer ${
              includeIof
                ? 'bg-violet-500/20 border-violet-500/50 text-violet-200'
                : 'bg-slate-800/60 border-slate-700 text-slate-400'
            }`}
          >
            {includeIof ? '✓ IOF Embutido' : 'IOF Oculto'} ({formatBRL(kpis.totalIof)})
          </button>

          <button
            onClick={() => setNetRefunds(!netRefunds)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition cursor-pointer ${
              netRefunds
                ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-200'
                : 'bg-slate-800/60 border-slate-700 text-slate-400'
            }`}
          >
            {netRefunds ? '✓ Estornos Abatidos' : 'Sem Abater Estornos'} (
            {formatBRL(kpis.totalRefunds)})
          </button>
        </div>
      </div>

      {/* Main KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        {/* Receitas */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              Receitas / Entradas
            </span>
            <div className="p-2 rounded-xl bg-emerald-500/15 text-emerald-400">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-emerald-400">
            {formatBRL(kpis.totalIncome)}
          </div>
          <p className="text-xs text-slate-400 mt-1.5">
            Wise Câmbio + Transferências PJ / PF
          </p>
        </div>

        {/* Despesas Totais de Consumo */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              Gasto Unificado (Cartão + Conta)
            </span>
            <div className="p-2 rounded-xl bg-rose-500/15 text-rose-400">
              <TrendingDown className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-rose-400">
            {formatBRL(kpis.totalExpenses)}
          </div>
          <p className="text-xs text-slate-400 mt-1.5">
            {kpis.totalIncome > 0
              ? `${kpis.committedRatio.toFixed(1)}% da receita comprometida`
              : 'Cartão + Pix + Boletos + Débito'}
          </p>
        </div>

        {/* Gastos no Cartão */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              No Cartão de Crédito
            </span>
            <div className="p-2 rounded-xl bg-violet-500/15 text-violet-400">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-violet-300">
            {formatBRL(kpis.ccExpenses)}
          </div>
          <p className="text-xs text-slate-400 mt-1.5">
            {kpis.totalExpenses > 0
              ? `${((kpis.ccExpenses / kpis.totalExpenses) * 100).toFixed(1)}% do gasto total`
              : '0% do total'}
          </p>
        </div>

        {/* Gastos na Conta Corrente */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              Via Conta (Pix/Boleto)
            </span>
            <div className="p-2 rounded-xl bg-sky-500/15 text-sky-400">
              <Landmark className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-sky-300">
            {formatBRL(kpis.bankExpenses)}
          </div>
          <p className="text-xs text-slate-400 mt-1.5">
            {kpis.totalExpenses > 0
              ? `${((kpis.bankExpenses / kpis.totalExpenses) * 100).toFixed(1)}% do gasto total`
              : '0% do total'}
          </p>
        </div>

        {/* Saldo Líquido & Veredito */}
        <div
          className={`border rounded-2xl p-4 shadow-lg ${
            kpis.netSavings >= 0
              ? 'bg-emerald-950/25 border-emerald-500/40'
              : 'bg-rose-950/25 border-rose-500/40'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-white">
              {kpis.netSavings >= 0 ? 'Gastou MENOS que recebeu' : 'Gastou MAIS que recebeu'}
            </span>
            <div
              className={`p-2 rounded-xl ${
                kpis.netSavings >= 0
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'bg-rose-500/20 text-rose-400'
              }`}
            >
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div
            className={`text-2xl font-bold ${
              kpis.netSavings >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {formatBRL(kpis.netSavings, true)}
          </div>
          <p className="text-xs text-slate-300 mt-1.5 flex items-center gap-1">
            <PiggyBank className="w-3.5 h-3.5 text-sky-400" />
            {kpis.netSavings >= 0
              ? `Sobrou ${kpis.savingsRate.toFixed(1)}% da renda`
              : `Excedeu a renda em ${Math.abs(kpis.savingsRate).toFixed(1)}%`}
          </p>
        </div>
      </div>

      {/* 2. UNIFIED MONTHLY BALANCE SECTION (Cartão + Conta vs Receitas Mês a Mês) */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-violet-500/15 text-violet-400 border border-violet-500/30">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                Balanço Unificado Mês a Mês (Cartão de Crédito + Conta Corrente vs. Receitas)
              </h3>
              <p className="text-xs text-slate-400">
                Descubra em cada mês se você gastou <strong>menos</strong> (Superávit) ou{' '}
                <strong>mais</strong> (Déficit) do que recebeu, somando Cartão + Pix/Boletos/Débito
              </p>
            </div>
          </div>

          {/* Regime Selector */}
          <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setAccountingRegime('competence')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                accountingRegime === 'competence'
                  ? 'bg-violet-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Por Data da Compra (Competência)
            </button>
            <button
              onClick={() => setAccountingRegime('invoice')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                accountingRegime === 'invoice'
                  ? 'bg-violet-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Por Mês da Fatura do Cartão
            </button>
          </div>
        </div>

        {/* Summary Strip of Unified Months */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3.5 rounded-xl bg-emerald-950/20 border border-emerald-500/30 flex items-center justify-between">
            <div>
              <span className="text-xs text-emerald-300 font-semibold block">
                Meses no Azul (Gastou MENOS que recebeu)
              </span>
              <span className="text-[11px] text-slate-400">
                Entre os {unifiedBalanceOverview.completeMonthsCount} meses com extrato completo
              </span>
            </div>
            <span className="text-2xl font-bold text-emerald-400">
              {unifiedBalanceOverview.surplusCount} meses
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-rose-950/20 border border-rose-500/30 flex items-center justify-between">
            <div>
              <span className="text-xs text-rose-300 font-semibold block">
                Meses no Vermelho (Gastou MAIS que recebeu)
              </span>
              <span className="text-[11px] text-slate-400">
                Quando Cartão + Conta superaram as entradas
              </span>
            </div>
            <span className="text-2xl font-bold text-rose-400">
              {unifiedBalanceOverview.deficitCount} meses
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-300 font-semibold block">
                Balanço Acumulado (Meses Completos)
              </span>
              <span className="text-[11px] text-slate-400">
                Receitas ({formatCompactBRL(unifiedBalanceOverview.totalCompleteIncome)}) - Gastos (
                {formatCompactBRL(unifiedBalanceOverview.totalCompleteExpenses)})
              </span>
            </div>
            <span
              className={`text-lg font-bold ${
                unifiedBalanceOverview.totalCompleteBalance >= 0
                  ? 'text-emerald-400'
                  : 'text-rose-400'
              }`}
            >
              {formatBRL(unifiedBalanceOverview.totalCompleteBalance, true)}
            </span>
          </div>
        </div>

        {/* Unified Chart: Income vs Stacked Expenses (Card + Bank) + Net Balance Line */}
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={monthlySeries}
              margin={{ top: 10, right: 15, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="label" stroke="#94a3b8" fontSize={12} />
              <YAxis
                stroke="#94a3b8"
                fontSize={11}
                tickFormatter={(v) => formatCompactBRL(v)}
              />
              <ReferenceLine y={0} stroke="#475569" strokeDasharray="3 3" />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0f172a',
                  borderColor: '#334155',
                  borderRadius: '0.75rem',
                  color: '#f8fafc',
                }}
                formatter={(value: any, name: string) => [
                  formatBRL(Number(value), name.includes('Balanço')),
                  name,
                ]}
              />
              <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
              <Bar
                dataKey="Receitas"
                name="Receitas (Conta)"
                fill="#10b981"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="Cartao"
                name="Gastos Cartão"
                stackId="expenses"
                fill="#8b5cf6"
              />
              <Bar
                dataKey="Conta"
                name="Gastos Conta (Pix/Boleto)"
                stackId="expenses"
                fill="#0ea5e9"
                radius={[4, 4, 0, 0]}
              />
              <Line
                type="monotone"
                dataKey="Saldo"
                name="Balanço do Mês (Receita - Gasto Total)"
                stroke="#fbbf24"
                strokeWidth={2.5}
                dot={{ r: 4, fill: '#fbbf24' }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Month-by-Month Unified Balance Table */}
        <div className="overflow-x-auto border border-slate-800 rounded-xl">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-950/90 border-b border-slate-800 text-slate-400 uppercase">
                <th className="py-2.5 px-3">Mês</th>
                <th className="py-2.5 px-3 text-right">Receitas (Conta)</th>
                <th className="py-2.5 px-3 text-right">Gastos Cartão</th>
                <th className="py-2.5 px-3 text-right">Gastos Conta (Pix/Boleto)</th>
                <th className="py-2.5 px-3 text-right">Gasto Unificado Total</th>
                <th className="py-2.5 px-3 text-right">Balanço do Mês</th>
                <th className="py-2.5 px-3 text-center">Diagnóstico Unificado</th>
                <th className="py-2.5 px-3 text-right">Acumulado no Ano</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {monthlySeries.map((m) => {
                const isMissingBank = !m.hasBankTx;
                const isSurplus = m.Saldo >= 0;

                return (
                  <tr key={m.month} className="hover:bg-slate-800/40 transition">
                    <td className="py-2.5 px-3 font-bold text-white whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <span>{m.fullLabel}</span>
                        {isMissingBank && (
                          <span
                            title="Falta enviar o extrato da Conta Corrente deste mês"
                            className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-medium"
                          >
                            Falta Extrato Conta
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-semibold text-emerald-400 whitespace-nowrap">
                      {isMissingBank ? (
                        <span className="text-slate-500 italic">Pendente CSV</span>
                      ) : (
                        formatBRL(m.Receitas)
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right text-violet-300 whitespace-nowrap">
                      {formatBRL(m.Cartao)}
                    </td>
                    <td className="py-2.5 px-3 text-right text-sky-300 whitespace-nowrap">
                      {isMissingBank ? '—' : formatBRL(m.Conta)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-rose-300 whitespace-nowrap">
                      {formatBRL(m.TotalDespesas)}
                    </td>
                    <td
                      className={`py-2.5 px-3 text-right font-bold whitespace-nowrap ${
                        isMissingBank
                          ? 'text-amber-300'
                          : isSurplus
                          ? 'text-emerald-400'
                          : 'text-rose-400'
                      }`}
                    >
                      {formatBRL(m.Saldo, true)}
                    </td>
                    <td className="py-2.5 px-3 text-center whitespace-nowrap">
                      {isMissingBank ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                          <AlertTriangle className="w-3 h-3" />
                          Extrato Bancário Pendente
                        </span>
                      ) : isSurplus ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                          <Check className="w-3 h-3" />
                          Gastou MENOS ({m.spentRatio.toFixed(0)}% da renda)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                          <TrendingDown className="w-3 h-3" />
                          Gastou MAIS ({m.spentRatio.toFixed(0)}% da renda)
                        </span>
                      )}
                    </td>
                    <td
                      className={`py-2.5 px-3 text-right font-mono font-semibold whitespace-nowrap ${
                        m.SaldoAcumulado >= 0 ? 'text-emerald-300' : 'text-rose-300'
                      }`}
                    >
                      {formatBRL(m.SaldoAcumulado, true)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. CATEGORY EVOLUTION BY MONTH + CATEGORY DISTRIBUTION */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Category Distribution Donut + Selector List (5 cols) */}
        <div className="lg:col-span-5 bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-base font-bold text-white">
                Ranking de Categorias
              </h3>
              <p className="text-xs text-slate-400">
                Clique em uma categoria para ver o gráfico de evolução mês a mês ao lado
              </p>
            </div>
          </div>

          <div className="h-44 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={categoryBreakdown}
                  dataKey="amount"
                  nameKey="category"
                  cx="50%"
                  cy="50%"
                  innerRadius={44}
                  outerRadius={72}
                  paddingAngle={2}
                  onClick={(entry) => setSelectedCategoryChart(entry.category)}
                  style={{ cursor: 'pointer' }}
                >
                  {categoryBreakdown.map((entry) => (
                    <Cell
                      key={entry.category}
                      fill={entry.color}
                      stroke={
                        effectiveSelectedCategory === entry.category
                          ? '#ffffff'
                          : 'transparent'
                      }
                      strokeWidth={2.5}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderColor: '#334155',
                    borderRadius: '0.75rem',
                  }}
                  formatter={(value: any) => formatBRL(Number(value))}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="flex-1 overflow-y-auto max-h-72 space-y-2 pr-1 mt-2">
            {categoryBreakdown.map((cat) => {
              const budget = categoryBudgets[cat.category] || 0;
              const isSelected = effectiveSelectedCategory === cat.category;
              return (
                <button
                  key={cat.category}
                  onClick={() => setSelectedCategoryChart(cat.category)}
                  className={`w-full text-left p-2.5 rounded-xl border transition cursor-pointer ${
                    isSelected
                      ? 'bg-violet-600/20 border-violet-500 shadow-md'
                      : 'bg-slate-950/50 border-slate-800/80 hover:bg-slate-800/50'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs mb-1">
                    <div className="flex items-center gap-2 font-medium text-slate-200 truncate">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: cat.color }}
                      />
                      <span className="truncate font-semibold">{cat.category}</span>
                      <span className="text-slate-500">({cat.count}x)</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-semibold text-white">
                        {formatBRL(cat.amount)}
                      </span>
                      <span className="text-slate-400 w-11 text-right">
                        {cat.percentage.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                  <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.min(100, cat.percentage)}%`,
                        backgroundColor: cat.color,
                      }}
                    />
                  </div>
                  {budget > 0 && selectedMonth !== 'ALL' && (
                    <div className="flex justify-between text-[11px] text-slate-400 mt-1">
                      <span>Meta mensal: {formatBRL(budget)}</span>
                      <span
                        className={
                          cat.amount > budget
                            ? 'text-rose-400 font-semibold'
                            : 'text-emerald-400'
                        }
                      >
                        {((cat.amount / budget) * 100).toFixed(0)}% da meta
                      </span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Monthly Evolution Chart for Selected Category (7 cols) */}
        <div className="lg:col-span-7 bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col justify-between space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div
                className="p-2 rounded-xl"
                style={{
                  backgroundColor: `${getCategoryColor(effectiveSelectedCategory)}20`,
                  color: getCategoryColor(effectiveSelectedCategory),
                }}
              >
                <BarChart3 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">
                  Gastos Mês a Mês da Categoria:{' '}
                  <span style={{ color: getCategoryColor(effectiveSelectedCategory) }}>
                    {effectiveSelectedCategory}
                  </span>
                </h3>
                <p className="text-xs text-slate-400">
                  Evolução mensal somando Cartão de Crédito + Conta Corrente para a categoria selecionada
                </p>
              </div>
            </div>

            {/* Category Dropdown Selector */}
            <select
              value={effectiveSelectedCategory}
              onChange={(e) => setSelectedCategoryChart(e.target.value)}
              className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs font-semibold text-white focus:outline-none focus:border-violet-500 cursor-pointer"
            >
              {allExpenseCategories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* 4 Mini KPIs for the Selected Category */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800">
              <span className="text-[11px] text-slate-400 block">Total no Ano</span>
              <span className="text-sm font-bold text-white mt-0.5 block">
                {formatBRL(selectedCategoryMonthlyAnalysis.grandTotal)}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800">
              <span className="text-[11px] text-slate-400 block">
                Média por Mês Ativo ({selectedCategoryMonthlyAnalysis.activeMonthsCount}m)
              </span>
              <span className="text-sm font-bold text-violet-300 mt-0.5 block">
                {formatBRL(selectedCategoryMonthlyAnalysis.averageActiveMonth)}/mês
              </span>
            </div>
            <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800">
              <span className="text-[11px] text-slate-400 block">Mês de Maior Gasto</span>
              <span className="text-sm font-bold text-rose-300 mt-0.5 block">
                {selectedCategoryMonthlyAnalysis.peakMonth
                  ? `${selectedCategoryMonthlyAnalysis.peakMonth.label} (${formatBRL(
                      selectedCategoryMonthlyAnalysis.peakMonth.Total
                    )})`
                  : '—'}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800">
              <span className="text-[11px] text-slate-400 block">Maior Estabelecimento</span>
              <span className="text-sm font-bold text-emerald-300 mt-0.5 block truncate">
                {selectedCategoryMonthlyAnalysis.topMerchants[0]
                  ? selectedCategoryMonthlyAnalysis.topMerchants[0].merchantGroup
                  : '—'}
              </span>
            </div>
          </div>

          {/* Bar Chart of Category by Month */}
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={selectedCategoryMonthlyAnalysis.series}
                margin={{ top: 10, right: 15, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="label" stroke="#94a3b8" fontSize={12} />
                <YAxis
                  stroke="#94a3b8"
                  fontSize={11}
                  tickFormatter={(v) => formatCompactBRL(v)}
                />
                {selectedCategoryMonthlyAnalysis.averageActiveMonth > 0 && (
                  <ReferenceLine
                    y={selectedCategoryMonthlyAnalysis.averageActiveMonth}
                    stroke="#f59e0b"
                    strokeDasharray="4 4"
                    label={{
                      value: `Média: ${formatCompactBRL(
                        selectedCategoryMonthlyAnalysis.averageActiveMonth
                      )}`,
                      fill: '#fbbf24',
                      fontSize: 10,
                      position: 'insideTopRight',
                    }}
                  />
                )}
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderColor: '#334155',
                    borderRadius: '0.75rem',
                    color: '#f8fafc',
                  }}
                  formatter={(value: any, name: string) => [formatBRL(Number(value)), name]}
                />
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '6px' }} />
                <Bar
                  dataKey="Cartao"
                  name="No Cartão de Crédito"
                  stackId="cat"
                  fill={getCategoryColor(effectiveSelectedCategory)}
                  radius={[0, 0, 0, 0]}
                />
                <Bar
                  dataKey="Conta"
                  name="Na Conta Corrente (Pix/Boleto/Débito)"
                  stackId="cat"
                  fill="#0ea5e9"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Top Establishments inside the Selected Category */}
          <div className="pt-2 border-t border-slate-800/80">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
              <span className="font-semibold text-slate-300">
                Principais Estabelecimentos em {effectiveSelectedCategory} (
                {selectedCategoryMonthlyAnalysis.topMerchants.length})
              </span>
              <span>Clique para abrir o grupo</span>
            </div>
            <div className="flex flex-wrap gap-2 max-h-28 overflow-y-auto">
              {selectedCategoryMonthlyAnalysis.topMerchants.slice(0, 12).map((m) => (
                <button
                  key={m.merchantGroup}
                  onClick={() => onNavigateToGroups(m.merchantGroup)}
                  className="px-3 py-1.5 rounded-xl bg-slate-950/80 hover:bg-slate-800 border border-slate-800 text-xs flex items-center gap-2 transition cursor-pointer"
                >
                  <span className="font-semibold text-white">{m.merchantGroup}</span>
                  <span className="text-slate-400">({m.count}x)</span>
                  <span className="font-bold text-violet-300">{formatBRL(m.total)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Top 10 Grouped Merchants Table */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-violet-400" />
            <div>
              <h3 className="text-base font-semibold text-white">
                Top 10 Grupos de Compras & Estabelecimentos
              </h3>
              <p className="text-xs text-slate-400">
                Compras consolidadas somando Cartão de Crédito + Pix + Débito + IOF - Estornos
              </p>
            </div>
          </div>
          <button
            onClick={() => onNavigateToGroups()}
            className="flex items-center gap-1.5 text-xs font-medium text-violet-400 hover:text-violet-300 bg-violet-500/10 border border-violet-500/30 px-3 py-1.5 rounded-xl transition cursor-pointer"
          >
            <span>Ver todos os grupos de compras</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 uppercase">
                <th className="py-2.5 px-3">#</th>
                <th className="py-2.5 px-3">Estabelecimento / Grupo</th>
                <th className="py-2.5 px-3">Categoria</th>
                <th className="py-2.5 px-3 text-center">Frequência</th>
                <th className="py-2.5 px-3 text-right">No Cartão</th>
                <th className="py-2.5 px-3 text-right">Na Conta (Pix/Débito)</th>
                <th className="py-2.5 px-3 text-right">Ticket Médio</th>
                <th className="py-2.5 px-3 text-right">Total Consolidado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {topMerchantGroups.map((g, idx) => (
                <tr
                  key={g.merchantGroup}
                  onClick={() => onNavigateToGroups(g.merchantGroup)}
                  className="hover:bg-slate-800/50 transition cursor-pointer"
                >
                  <td className="py-3 px-3 font-mono text-slate-500">{idx + 1}</td>
                  <td className="py-3 px-3 font-semibold text-white flex items-center gap-2">
                    <Receipt className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                    <span>{g.merchantGroup}</span>
                  </td>
                  <td className="py-3 px-3">
                    <span
                      className="px-2.5 py-0.5 rounded-full text-[11px] font-medium"
                      style={{
                        backgroundColor: `${getCategoryColor(g.category)}20`,
                        color: getCategoryColor(g.category),
                      }}
                    >
                      {g.category}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-center text-slate-300 font-medium">
                    {g.count}x
                  </td>
                  <td className="py-3 px-3 text-right text-violet-300">
                    {g.ccAmount > 0 ? formatBRL(g.ccAmount) : '-'}
                  </td>
                  <td className="py-3 px-3 text-right text-sky-300">
                    {g.bankAmount > 0 ? formatBRL(g.bankAmount) : '-'}
                  </td>
                  <td className="py-3 px-3 text-right text-slate-300">
                    {g.count > 0 ? formatBRL(g.amount / g.count) : '-'}
                  </td>
                  <td className="py-3 px-3 text-right font-bold text-white">
                    {formatBRL(g.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
