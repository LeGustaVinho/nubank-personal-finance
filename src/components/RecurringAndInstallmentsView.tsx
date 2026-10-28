import React, { useMemo, useState } from 'react';
import {
  Search,
  Sparkles,
  CreditCard,
  Landmark,
  Globe,
  CalendarClock,
  ChevronDown,
  ChevronUp,
  Layers,
  ShieldCheck,
  Activity,
  Tv,
  SlidersHorizontal,
  CheckCircle2,
  Clock,
  ArrowUpDown,
  RotateCcw,
} from 'lucide-react';
import { UnifiedTransaction, CostTypeOverrideValue } from '../../server/types';
import {
  formatBRL,
  formatDateBR,
  formatMonthShort,
  getCategoryColor,
} from '../utils/formatters';

interface RecurringAndInstallmentsViewProps {
  allTransactions: UnifiedTransaction[];
  costTypeOverrides: Record<string, CostTypeOverrideValue>;
  onUpdateCostType: (
    merchantGroup: string,
    costType: CostTypeOverrideValue | null
  ) => Promise<void>;
}

export type CostClassification =
  | 'digital_subscription'
  | 'fixed_cost'
  | 'variable_recurring'
  | 'one_off';

export interface ServiceRecurringProfile {
  merchantGroup: string;
  category: string;
  costType: CostClassification;
  costTypeLabel: string;
  isManualOverride: boolean;
  isInternational: boolean;
  activeMonthsCount: number;
  totalOccurrences: number;
  totalSpent: number;
  totalIof: number;
  monthlyAverage: number;
  lastChargeAmount: number;
  lastChargeDate: string;
  minMonthly: number;
  maxMonthly: number;
  byMonth: Map<string, number>;
  primarySource: 'creditCard' | 'bankAccount' | 'both';
  items: UnifiedTransaction[];
}

const DIGITAL_SUBSCRIPTION_GROUPS = new Set([
  'OpenAI (ChatGPT Plus / API)',
  'Anthropic (Claude AI)',
  'YouTube Premium',
  'Google One / Google Services',
  'MEGA & Proton (Cloud / Privacidade)',
  'Discord Nitro',
  'Streaming (Netflix, Crunchyroll, WeTV, Prime Video)',
  'CCP Games (EVE Online)',
  'Nitrado Game Servers',
  'Google Superlive & Serviços Digitais',
]);

const FIXED_COST_GROUPS = new Set([
  'CEMIG (Energia Elétrica)',
  'COPASA (Água e Esgoto)',
  'Claro (Telefonia / Fibra)',
  'Nova Rede Telecomunicações (Internet)',
  'Unimed BH (Plano de Saúde)',
  'GL Apoio Adm e Locações',
]);

function classifyServiceCostType(
  merchantGroup: string,
  category: string,
  activeMonths: number,
  cv: number,
  override?: CostTypeOverrideValue
): { costType: CostClassification; isManualOverride: boolean } {
  if (override) {
    return { costType: override, isManualOverride: true };
  }
  if (
    DIGITAL_SUBSCRIPTION_GROUPS.has(merchantGroup) ||
    category === 'Assinaturas Digitais & IA'
  ) {
    return { costType: 'digital_subscription', isManualOverride: false };
  }
  if (
    FIXED_COST_GROUPS.has(merchantGroup) ||
    category === 'Moradia & Contas Fixas'
  ) {
    return { costType: 'fixed_cost', isManualOverride: false };
  }
  if (activeMonths >= 3 && cv < 0.15) {
    return { costType: 'fixed_cost', isManualOverride: false };
  }
  return { costType: 'variable_recurring', isManualOverride: false };
}

export const RecurringAndInstallmentsView: React.FC<
  RecurringAndInstallmentsViewProps
> = ({ allTransactions, costTypeOverrides, onUpdateCostType }) => {
  const [filterType, setFilterType] = useState<
    'ALL' | CostClassification | 'installments'
  >('ALL');
  const [billingFilter, setBillingFilter] = useState<
    'ALL' | 'international' | 'national'
  >('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<
    'monthlyAverage' | 'totalSpent' | 'activeMonths' | 'lastDate' | 'name'
  >('monthlyAverage');
  const [expandedService, setExpandedService] = useState<string | null>(null);

  const allMonths = useMemo(() => {
    const s = new Set<string>();
    for (const tx of allTransactions) {
      if (tx.competenceMonth) s.add(tx.competenceMonth);
    }
    return Array.from(s).sort();
  }, [allTransactions]);

  const services = useMemo(() => {
    const map = new Map<
      string,
      {
        merchantGroup: string;
        category: string;
        totalSpent: number;
        totalIof: number;
        totalOccurrences: number;
        isInternational: boolean;
        lastChargeAmount: number;
        lastChargeDate: string;
        hasCC: boolean;
        hasBank: boolean;
        byMonth: Map<string, number>;
        items: UnifiedTransaction[];
      }
    >();

    for (const tx of allTransactions) {
      if (
        tx.flowKind === 'cc_payment' ||
        tx.flowKind === 'investment' ||
        tx.flowKind === 'internal_transfer' ||
        tx.flowKind === 'income' ||
        tx.installment !== null
      ) {
        continue;
      }

      if (tx.expenseAmount === 0) continue;

      const g = tx.merchantGroup;
      if (!map.has(g)) {
        map.set(g, {
          merchantGroup: g,
          category: tx.category,
          totalSpent: 0,
          totalIof: 0,
          totalOccurrences: 0,
          isInternational: false,
          lastChargeAmount: 0,
          lastChargeDate: '0000-00-00',
          hasCC: false,
          hasBank: false,
          byMonth: new Map(),
          items: [],
        });
      }

      const entry = map.get(g)!;
      entry.items.push(tx);
      entry.totalSpent += tx.expenseAmount;

      if (tx.flowKind === 'iof') {
        entry.totalIof += Math.abs(tx.rawAmount);
        entry.isInternational = true;
      } else if (tx.flowKind === 'expense') {
        entry.totalOccurrences += 1;
        if (tx.date >= entry.lastChargeDate) {
          entry.lastChargeDate = tx.date;
          entry.lastChargeAmount = Math.abs(tx.rawAmount);
        }
      }

      if (tx.source === 'creditCard') entry.hasCC = true;
      else entry.hasBank = true;

      entry.byMonth.set(
        tx.competenceMonth,
        (entry.byMonth.get(tx.competenceMonth) || 0) + tx.expenseAmount
      );
    }

    const profiles: ServiceRecurringProfile[] = [];

    for (const item of map.values()) {
      const monthValues = Array.from(item.byMonth.values()).filter((v) => v > 0);
      const activeMonthsCount = monthValues.length;
      if (item.totalSpent <= 0) continue;

      const userOverride = costTypeOverrides[item.merchantGroup];

      const isKnownSubOrFixed =
        Boolean(userOverride) ||
        DIGITAL_SUBSCRIPTION_GROUPS.has(item.merchantGroup) ||
        FIXED_COST_GROUPS.has(item.merchantGroup) ||
        item.category === 'Assinaturas Digitais & IA' ||
        item.category === 'Moradia & Contas Fixas';

      // Include if user explicitly overrode, or if it's recurring (>=2 months / >=2 charges), or if user is searching all
      if (
        !isKnownSubOrFixed &&
        activeMonthsCount < 2 &&
        item.totalOccurrences < 2 &&
        !search.trim()
      ) {
        continue;
      }

      const monthlyAverage =
        activeMonthsCount > 0 ? item.totalSpent / activeMonthsCount : item.totalSpent;
      const minMonthly = monthValues.length > 0 ? Math.min(...monthValues) : 0;
      const maxMonthly = monthValues.length > 0 ? Math.max(...monthValues) : 0;

      const mean = monthlyAverage;
      const variance =
        monthValues.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) /
        Math.max(1, monthValues.length);
      const stdDev = Math.sqrt(variance);
      const cv = mean > 0 ? stdDev / mean : 1;

      const { costType, isManualOverride } = classifyServiceCostType(
        item.merchantGroup,
        item.category,
        activeMonthsCount,
        cv,
        userOverride
      );

      const costTypeLabel =
        costType === 'digital_subscription'
          ? 'Assinatura Digital'
          : costType === 'fixed_cost'
          ? 'Custo Fixo'
          : costType === 'variable_recurring'
          ? 'Custo Variável'
          : 'Gasto Pontual';

      profiles.push({
        merchantGroup: item.merchantGroup,
        category: item.category,
        costType,
        costTypeLabel,
        isManualOverride,
        isInternational: item.isInternational,
        activeMonthsCount,
        totalOccurrences: item.totalOccurrences,
        totalSpent: Math.round(item.totalSpent * 100) / 100,
        totalIof: Math.round(item.totalIof * 100) / 100,
        monthlyAverage: Math.round(monthlyAverage * 100) / 100,
        lastChargeAmount: Math.round(item.lastChargeAmount * 100) / 100,
        lastChargeDate: item.lastChargeDate,
        minMonthly: Math.round(minMonthly * 100) / 100,
        maxMonthly: Math.round(maxMonthly * 100) / 100,
        byMonth: item.byMonth,
        primarySource:
          item.hasCC && item.hasBank
            ? 'both'
            : item.hasCC
            ? 'creditCard'
            : 'bankAccount',
        items: item.items.sort((a, b) => b.date.localeCompare(a.date)),
      });
    }

    return profiles;
  }, [allTransactions, costTypeOverrides, search]);

  const installmentPlans = useMemo(() => {
    const map = new Map<
      string,
      {
        baseTitle: string;
        merchantGroup: string;
        category: string;
        totalInstallments: number;
        paidInstallments: number[];
        amountPerInstallment: number;
        totalPaidSoFar: number;
        anticipationDiscount: number;
        items: UnifiedTransaction[];
      }
    >();

    for (const tx of allTransactions) {
      if (tx.installment) {
        const key = `${tx.installment.baseMerchantTitle.toLowerCase()}_${tx.installment.total}`;
        if (!map.has(key)) {
          map.set(key, {
            baseTitle: tx.installment.baseMerchantTitle,
            merchantGroup: tx.merchantGroup,
            category: tx.category,
            totalInstallments: tx.installment.total,
            paidInstallments: [],
            amountPerInstallment: Math.abs(tx.rawAmount),
            totalPaidSoFar: 0,
            anticipationDiscount: 0,
            items: [],
          });
        }
        const plan = map.get(key)!;
        plan.items.push(tx);
        plan.paidInstallments.push(tx.installment.current);
        plan.totalPaidSoFar += Math.abs(tx.rawAmount);
      }
    }

    for (const tx of allTransactions) {
      if (tx.rawDescription.toLowerCase().startsWith('desconto antecipação')) {
        for (const plan of map.values()) {
          if (tx.rawDescription.toLowerCase().includes(plan.baseTitle.toLowerCase())) {
            plan.anticipationDiscount += Math.abs(tx.rawAmount);
          }
        }
      }
    }

    return Array.from(map.values()).map((plan) => {
      const uniquePaid = Array.from(new Set(plan.paidInstallments)).sort((a, b) => a - b);
      const remainingCount = Math.max(0, plan.totalInstallments - uniquePaid.length);
      return {
        ...plan,
        uniquePaid,
        remainingCount,
        projectedRemainingAmount: remainingCount * plan.amountPerInstallment,
        isCompleted: remainingCount === 0,
      };
    });
  }, [allTransactions]);

  const summaryStats = useMemo(() => {
    const subs = services.filter((s) => s.costType === 'digital_subscription');
    const fixed = services.filter((s) => s.costType === 'fixed_cost');
    const variable = services.filter((s) => s.costType === 'variable_recurring');
    const oneOff = services.filter((s) => s.costType === 'one_off');

    const subsMonthly = subs.reduce((acc, s) => acc + s.monthlyAverage, 0);
    const subsTotal = subs.reduce((acc, s) => acc + s.totalSpent, 0);

    const fixedMonthly = fixed.reduce((acc, s) => acc + s.monthlyAverage, 0);
    const fixedTotal = fixed.reduce((acc, s) => acc + s.totalSpent, 0);

    const variableMonthly = variable.reduce((acc, s) => acc + s.monthlyAverage, 0);
    const variableTotal = variable.reduce((acc, s) => acc + s.totalSpent, 0);

    const activeInstallmentsMonthly = installmentPlans
      .filter((p) => !p.isCompleted)
      .reduce((acc, p) => acc + p.amountPerInstallment, 0);

    return {
      subsCount: subs.length,
      subsMonthly,
      subsTotal,
      fixedCount: fixed.length,
      fixedMonthly,
      fixedTotal,
      variableCount: variable.length,
      variableMonthly,
      variableTotal,
      oneOffCount: oneOff.length,
      committedMonthlyTotal: subsMonthly + fixedMonthly + activeInstallmentsMonthly,
      activeInstallmentsMonthly,
    };
  }, [services, installmentPlans]);

  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    for (const s of services) set.add(s.category);
    return Array.from(set).sort();
  }, [services]);

  const filteredServices = useMemo(() => {
    return services
      .filter((s) => {
        if (filterType === 'ALL') {
          // By default hide items explicitly marked as 'one_off' unless searching or filtering 'one_off'
          if (s.costType === 'one_off' && !search.trim()) return false;
        } else if (filterType !== 'installments' && s.costType !== filterType) {
          return false;
        }
        if (billingFilter === 'international' && !s.isInternational) return false;
        if (billingFilter === 'national' && s.isInternational) return false;
        if (categoryFilter !== 'ALL' && s.category !== categoryFilter) return false;
        if (search.trim()) {
          const q = search.toLowerCase().trim();
          const matchName = s.merchantGroup.toLowerCase().includes(q);
          const matchCat = s.category.toLowerCase().includes(q);
          const matchRaw = s.items.some((i) =>
            i.rawDescription.toLowerCase().includes(q)
          );
          if (!matchName && !matchCat && !matchRaw) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'monthlyAverage') return b.monthlyAverage - a.monthlyAverage;
        if (sortBy === 'totalSpent') return b.totalSpent - a.totalSpent;
        if (sortBy === 'activeMonths') return b.activeMonthsCount - a.activeMonthsCount;
        if (sortBy === 'lastDate') return b.lastChargeDate.localeCompare(a.lastChargeDate);
        return a.merchantGroup.localeCompare(b.merchantGroup);
      });
  }, [services, filterType, billingFilter, categoryFilter, search, sortBy]);

  return (
    <div className="space-y-8">
      {/* Top Executive Summary Cards (Click to Filter) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <button
          onClick={() =>
            setFilterType(
              filterType === 'digital_subscription' ? 'ALL' : 'digital_subscription'
            )
          }
          className={`text-left p-5 rounded-2xl border transition-all shadow-lg cursor-pointer ${
            filterType === 'digital_subscription'
              ? 'bg-violet-950/50 border-violet-500 ring-2 ring-violet-500/30'
              : 'bg-slate-900/90 border-slate-800 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-violet-300 uppercase tracking-wider">
              Assinaturas Digitais
            </span>
            <div className="p-2.5 rounded-xl bg-violet-500/15 text-violet-400">
              <Tv className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white">
            {formatBRL(summaryStats.subsMonthly)}
            <span className="text-xs font-normal text-slate-400"> /mês</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
            <span>{summaryStats.subsCount} serviços ativos</span>
            <span>Acumulado: {formatBRL(summaryStats.subsTotal)}</span>
          </div>
        </button>

        <button
          onClick={() =>
            setFilterType(filterType === 'fixed_cost' ? 'ALL' : 'fixed_cost')
          }
          className={`text-left p-5 rounded-2xl border transition-all shadow-lg cursor-pointer ${
            filterType === 'fixed_cost'
              ? 'bg-cyan-950/50 border-cyan-500 ring-2 ring-cyan-500/30'
              : 'bg-slate-900/90 border-slate-800 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-cyan-300 uppercase tracking-wider">
              Custos Fixos (Contas)
            </span>
            <div className="p-2.5 rounded-xl bg-cyan-500/15 text-cyan-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white">
            {formatBRL(summaryStats.fixedMonthly)}
            <span className="text-xs font-normal text-slate-400"> /mês</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
            <span>{summaryStats.fixedCount} contas fixas</span>
            <span>Acumulado: {formatBRL(summaryStats.fixedTotal)}</span>
          </div>
        </button>

        <button
          onClick={() =>
            setFilterType(
              filterType === 'variable_recurring' ? 'ALL' : 'variable_recurring'
            )
          }
          className={`text-left p-5 rounded-2xl border transition-all shadow-lg cursor-pointer ${
            filterType === 'variable_recurring'
              ? 'bg-amber-950/50 border-amber-500 ring-2 ring-amber-500/30'
              : 'bg-slate-900/90 border-slate-800 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-amber-300 uppercase tracking-wider">
              Custos Variáveis
            </span>
            <div className="p-2.5 rounded-xl bg-amber-500/15 text-amber-400">
              <Activity className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white">
            {formatBRL(summaryStats.variableMonthly)}
            <span className="text-xs font-normal text-slate-400"> /mês</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
            <span>{summaryStats.variableCount} serviços frequentes</span>
            <span>Delivery, Uber, Mercado...</span>
          </div>
        </button>

        <button
          onClick={() =>
            setFilterType(filterType === 'installments' ? 'ALL' : 'installments')
          }
          className={`text-left p-5 rounded-2xl border transition-all shadow-lg cursor-pointer ${
            filterType === 'installments'
              ? 'bg-emerald-950/50 border-emerald-500 ring-2 ring-emerald-500/30'
              : 'bg-slate-900/90 border-slate-800 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-emerald-300 uppercase tracking-wider">
              Base Fixa + Parcelas
            </span>
            <div className="p-2.5 rounded-xl bg-emerald-500/15 text-emerald-400">
              <CalendarClock className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-bold text-emerald-400">
            {formatBRL(summaryStats.committedMonthlyTotal)}
            <span className="text-xs font-normal text-slate-400"> /mês</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
            <span>Fixos + Assinaturas + Parcelas</span>
            <span>Parcelas: {formatBRL(summaryStats.activeInstallmentsMonthly)}/mês</span>
          </div>
        </button>
      </div>

      {/* Clean Filter, Search & Sort Toolbar */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {[
              {
                id: 'ALL',
                label: `Todos os Recorrentes (${
                  services.length - summaryStats.oneOffCount
                })`,
              },
              {
                id: 'digital_subscription',
                label: `Assinaturas Digitais (${summaryStats.subsCount})`,
              },
              {
                id: 'fixed_cost',
                label: `Custos Fixos (${summaryStats.fixedCount})`,
              },
              {
                id: 'variable_recurring',
                label: `Custos Variáveis (${summaryStats.variableCount})`,
              },
              {
                id: 'installments',
                label: `Compras Parceladas (${installmentPlans.length})`,
              },
              ...(summaryStats.oneOffCount > 0
                ? [
                    {
                      id: 'one_off',
                      label: `Gastos Pontuais (${summaryStats.oneOffCount})`,
                    },
                  ]
                : []),
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setFilterType(tab.id as any)}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
                  filterType === tab.id
                    ? 'bg-violet-600 text-white shadow-md shadow-violet-600/20'
                    : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
            <button
              onClick={() => setBillingFilter('ALL')}
              className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                billingFilter === 'ALL'
                  ? 'bg-slate-800 text-white font-medium'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Todas Moedas
            </button>
            <button
              onClick={() => setBillingFilter('international')}
              className={`px-2.5 py-1 rounded-lg transition flex items-center gap-1 cursor-pointer ${
                billingFilter === 'international'
                  ? 'bg-amber-500/20 text-amber-300 font-medium'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Globe className="w-3 h-3" />
              <span>Internacional + IOF</span>
            </button>
            <button
              onClick={() => setBillingFilter('national')}
              className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                billingFilter === 'national'
                  ? 'bg-slate-800 text-white font-medium'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Nacional (R$)
            </button>
          </div>
        </div>

        {filterType !== 'installments' && (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-1">
            <div className="md:col-span-5 relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar serviço (ex: ChatGPT, Claude, Unimed, Cemig, Netflix, Uber, iFood...)"
                className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-violet-500"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white cursor-pointer"
                >
                  Limpar
                </button>
              )}
            </div>

            <div className="md:col-span-4 flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-slate-400 shrink-0 hidden sm:block" />
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-violet-500"
              >
                <option value="ALL">Todas as Categorias ({availableCategories.length})</option>
                {availableCategories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-3 flex items-center gap-2">
              <ArrowUpDown className="w-4 h-4 text-slate-400 shrink-0 hidden sm:block" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-violet-500"
              >
                <option value="monthlyAverage">Ordenar: Maior Custo Mensal</option>
                <option value="totalSpent">Ordenar: Maior Gasto Acumulado</option>
                <option value="activeMonths">Ordenar: Mais Meses Recorrentes</option>
                <option value="lastDate">Ordenar: Cobrança Mais Recente</option>
                <option value="name">Ordenar: Nome (A-Z)</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Main Content: Services Cards Grid */}
      {filterType !== 'installments' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <h3 className="text-sm font-semibold text-slate-300">
              Exibindo {filteredServices.length}{' '}
              {filteredServices.length === 1 ? 'serviço encontrado' : 'serviços encontrados'}
              <span className="text-xs font-normal text-slate-500 ml-2">
                (Você pode alterar o tipo de qualquer item entre Assinatura, Custo Fixo ou Custo Variável no seletor do card)
              </span>
            </h3>
            <span className="text-xs text-slate-400">
              Soma das médias mensais listadas:{' '}
              <strong className="text-white">
                {formatBRL(
                  filteredServices.reduce((acc, s) => acc + s.monthlyAverage, 0)
                )}
                /mês
              </strong>
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {filteredServices.map((srv) => {
              const isExpanded = expandedService === srv.merchantGroup;

              const selectColor =
                srv.costType === 'digital_subscription'
                  ? 'bg-violet-500/15 text-violet-200 border-violet-500/40'
                  : srv.costType === 'fixed_cost'
                  ? 'bg-cyan-500/15 text-cyan-200 border-cyan-500/40'
                  : srv.costType === 'variable_recurring'
                  ? 'bg-amber-500/15 text-amber-200 border-amber-500/40'
                  : 'bg-slate-800 text-slate-300 border-slate-700';

              return (
                <div
                  key={srv.merchantGroup}
                  className={`bg-slate-900/90 border rounded-2xl p-5 transition-all shadow-lg flex flex-col justify-between ${
                    isExpanded
                      ? 'border-violet-500/60 md:col-span-2'
                      : 'border-slate-800/90 hover:border-slate-700'
                  }`}
                >
                  {/* Card Top Header */}
                  <div className="flex flex-wrap sm:flex-nowrap items-start justify-between gap-4">
                    <div className="space-y-2 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-base font-bold text-white break-words">
                          {srv.merchantGroup}
                        </h4>

                        {/* Interactive Override Selector for Cost Type */}
                        <div className="flex items-center gap-1">
                          <select
                            value={srv.costType}
                            onChange={(e) =>
                              onUpdateCostType(
                                srv.merchantGroup,
                                e.target.value as CostTypeOverrideValue
                              )
                            }
                            title="Clique para alterar manualmente entre Assinatura Digital, Custo Fixo, Custo Variável ou Gasto Pontual"
                            className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border cursor-pointer focus:outline-none ${selectColor}`}
                          >
                            <option value="digital_subscription" className="bg-slate-900 text-violet-300">
                              Assinatura Digital
                            </option>
                            <option value="fixed_cost" className="bg-slate-900 text-cyan-300">
                              Custo Fixo
                            </option>
                            <option value="variable_recurring" className="bg-slate-900 text-amber-300">
                              Custo Variável
                            </option>
                            <option value="one_off" className="bg-slate-900 text-slate-400">
                              Gasto Pontual (Ocultar)
                            </option>
                          </select>

                          {srv.isManualOverride && (
                            <button
                              onClick={() => onUpdateCostType(srv.merchantGroup, null)}
                              title="Restaurar classificação automática"
                              className="p-1 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white cursor-pointer"
                            >
                              <RotateCcw className="w-3 h-3" />
                            </button>
                          )}
                        </div>

                        {srv.isInternational && (
                          <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 text-[10px] font-medium flex items-center gap-1">
                            <Globe className="w-3 h-3" />
                            Intl +IOF
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                        <span
                          className="px-2 py-0.5 rounded-md text-[11px] font-medium"
                          style={{
                            backgroundColor: `${getCategoryColor(srv.category)}18`,
                            color: getCategoryColor(srv.category),
                          }}
                        >
                          {srv.category}
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          {srv.primarySource === 'creditCard' ? (
                            <>
                              <CreditCard className="w-3.5 h-3.5 text-violet-400" />
                              Cartão
                            </>
                          ) : srv.primarySource === 'bankAccount' ? (
                            <>
                              <Landmark className="w-3.5 h-3.5 text-sky-400" />
                              Conta (Pix/Boleto)
                            </>
                          ) : (
                            <>
                              <Layers className="w-3.5 h-3.5 text-emerald-400" />
                              Cartão + Conta
                            </>
                          )}
                        </span>
                        <span>•</span>
                        <span>
                          Presente em <strong>{srv.activeMonthsCount}</strong>{' '}
                          {srv.activeMonthsCount === 1 ? 'mês' : 'meses'} (
                          {srv.totalOccurrences} cobranças)
                        </span>
                      </div>
                    </div>

                    {/* Primary Monthly Cost Callout */}
                    <div className="text-right shrink-0">
                      <div className="text-xl font-bold text-white">
                        {formatBRL(srv.monthlyAverage)}
                        <span className="text-xs font-normal text-slate-400"> /mês</span>
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        Total no ano:{' '}
                        <strong className="text-slate-200">
                          {formatBRL(srv.totalSpent)}
                        </strong>
                      </div>
                    </div>
                  </div>

                  {/* Clean Key Metrics Row */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 my-4 text-xs">
                    <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800/80 min-w-0">
                      <span className="text-slate-400 block text-[11px] truncate">
                        Última Cobrança
                      </span>
                      <span className="font-semibold text-white block truncate mt-0.5">
                        {formatBRL(srv.lastChargeAmount)}
                      </span>
                      <span className="text-[10px] text-slate-500 block truncate">
                        em {formatDateBR(srv.lastChargeDate)}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800/80 min-w-0">
                      <span className="text-slate-400 block text-[11px] truncate">
                        Faixa Mensal (Min – Máx)
                      </span>
                      <span
                        className="font-semibold text-slate-200 block truncate mt-0.5"
                        title={
                          srv.minMonthly === srv.maxMonthly
                            ? formatBRL(srv.minMonthly)
                            : `${formatBRL(srv.minMonthly)} – ${formatBRL(srv.maxMonthly)}`
                        }
                      >
                        {srv.minMonthly === srv.maxMonthly
                          ? formatBRL(srv.minMonthly)
                          : `${formatBRL(srv.minMonthly)} – ${formatBRL(srv.maxMonthly)}`}
                      </span>
                      <span className="text-[10px] text-slate-500 block truncate">
                        {srv.costType === 'fixed_cost' ||
                        srv.costType === 'digital_subscription'
                          ? 'Previsível / Recorrente'
                          : 'Varia conforme consumo'}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800/80 min-w-0">
                      <span className="text-slate-400 block text-[11px] truncate">
                        {srv.isInternational ? 'IOF Acumulado' : 'Ticket por Uso'}
                      </span>
                      <span className="font-semibold text-slate-200 block truncate mt-0.5">
                        {srv.isInternational
                          ? formatBRL(srv.totalIof)
                          : formatBRL(
                              srv.totalOccurrences > 0
                                ? srv.totalSpent / srv.totalOccurrences
                                : srv.totalSpent
                            )}
                      </span>
                      <span className="text-[10px] text-slate-500 block truncate">
                        {srv.isInternational
                          ? 'Imposto já somado ao total'
                          : `${srv.totalOccurrences}x no período`}
                      </span>
                    </div>
                  </div>

                  {/* Full-Width Non-Overlapping Monthly Sparkbars Section */}
                  <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                        Histórico Mês a Mês ({allMonths.length} meses)
                      </span>

                      <button
                        onClick={() =>
                          setExpandedService(isExpanded ? null : srv.merchantGroup)
                        }
                        className="px-2.5 py-1 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-[11px] font-medium text-slate-200 flex items-center gap-1 shrink-0 cursor-pointer transition"
                      >
                        <span>{isExpanded ? 'Ocultar detalhes' : 'Ver cobranças'}</span>
                        {isExpanded ? (
                          <ChevronUp className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>

                    <div
                      className="grid gap-1.5 items-end pt-1"
                      style={{
                        gridTemplateColumns: `repeat(${Math.max(
                          1,
                          allMonths.length
                        )}, minmax(0, 1fr))`,
                      }}
                    >
                      {allMonths.map((m) => {
                        const rawVal = srv.byMonth.get(m) || 0;
                        const val = Math.max(0, rawVal);
                        const heightPct =
                          srv.maxMonthly > 0 && val > 0
                            ? Math.min(
                                100,
                                Math.max(18, Math.round((val / srv.maxMonthly) * 100))
                              )
                            : 10;
                        const shortMonthLabel = formatMonthShort(m)
                          .split('/')[0]
                          .replace('.', '');

                        return (
                          <div
                            key={m}
                            className="flex flex-col items-center min-w-0 group"
                            title={`${formatMonthShort(m)}: ${
                              val > 0 ? formatBRL(val) : 'Sem cobrança'
                            }`}
                          >
                            {/* Isolated Bar Track with strict overflow containment */}
                            <div className="w-full h-12 bg-slate-900/70 rounded-md p-0.5 flex items-end overflow-hidden border border-slate-800/50">
                              <div
                                className={`w-full rounded-sm transition-all ${
                                  val > 0
                                    ? srv.costType === 'digital_subscription'
                                      ? 'bg-violet-500 group-hover:bg-violet-400'
                                      : srv.costType === 'fixed_cost'
                                      ? 'bg-cyan-500 group-hover:bg-cyan-400'
                                      : 'bg-amber-500 group-hover:bg-amber-400'
                                    : 'bg-slate-800/40'
                                }`}
                                style={{ height: `${heightPct}%` }}
                              />
                            </div>
                            {/* Non-overlapping Month Label */}
                            <span className="text-[9px] font-mono text-slate-400 mt-1.5 truncate w-full text-center capitalize">
                              {shortMonthLabel}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Expanded History Drawer */}
                  {isExpanded && (
                    <div className="mt-5 pt-4 border-t border-slate-800 space-y-3">
                      <div className="flex flex-wrap gap-2">
                        {Array.from(srv.byMonth.entries())
                          .sort((a, b) => a[0].localeCompare(b[0]))
                          .map(([m, val]) => (
                            <div
                              key={m}
                              className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs"
                            >
                              <span className="text-slate-400 mr-1.5">
                                {formatMonthShort(m)}:
                              </span>
                              <span className="font-bold text-white">
                                {formatBRL(val)}
                              </span>
                            </div>
                          ))}
                      </div>

                      <div className="max-h-64 overflow-y-auto border border-slate-800 rounded-xl">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead className="bg-slate-950 sticky top-0 text-slate-400">
                            <tr>
                              <th className="py-2 px-3">Data</th>
                              <th className="py-2 px-3">Origem</th>
                              <th className="py-2 px-3">Descrição no CSV</th>
                              <th className="py-2 px-3 text-right">Valor</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60">
                            {srv.items.map((tx) => (
                              <tr key={tx.id} className="hover:bg-slate-800/40">
                                <td className="py-2 px-3 font-mono text-slate-300">
                                  {formatDateBR(tx.date)}
                                </td>
                                <td className="py-2 px-3 text-slate-400">
                                  {tx.source === 'creditCard' ? 'Cartão' : 'Conta'}
                                </td>
                                <td className="py-2 px-3 text-slate-200">
                                  {tx.rawDescription}
                                </td>
                                <td
                                  className={`py-2 px-3 text-right font-semibold ${
                                    tx.flowKind === 'refund'
                                      ? 'text-emerald-400'
                                      : tx.flowKind === 'iof'
                                      ? 'text-amber-300'
                                      : 'text-white'
                                  }`}
                                >
                                  {tx.flowKind === 'refund'
                                    ? `- ${formatBRL(Math.abs(tx.rawAmount))}`
                                    : formatBRL(Math.abs(tx.rawAmount))}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Installments Section */}
      {(filterType === 'ALL' || filterType === 'installments') && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-lg space-y-4">
          <div className="flex items-center gap-2.5">
            <CalendarClock className="w-5 h-5 text-emerald-400" />
            <div>
              <h3 className="text-base font-bold text-white">
                Compras Parceladas & Prazo de Término
              </h3>
              <p className="text-xs text-slate-400">
                Acompanhe quantas parcelas já foram pagas e quanto falta para encerrar cada parcelamento
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {installmentPlans.map((plan) => {
              const pct = (plan.uniquePaid.length / plan.totalInstallments) * 100;
              return (
                <div
                  key={plan.baseTitle}
                  className="p-5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="text-base font-bold text-white">
                        {plan.baseTitle}
                      </h4>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {plan.category} • Parcela mensal de{' '}
                        <strong className="text-white">
                          {formatBRL(plan.amountPerInstallment)}
                        </strong>
                      </p>
                    </div>

                    {plan.isCompleted ? (
                      <span className="px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-400 text-xs font-semibold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Concluído ({plan.uniquePaid.length}/{plan.totalInstallments})
                      </span>
                    ) : (
                      <span className="px-3 py-1 rounded-full bg-amber-500/15 text-amber-300 text-xs font-semibold flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        Parcela {plan.uniquePaid.length} de {plan.totalInstallments}
                      </span>
                    )}
                  </div>

                  <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        plan.isCompleted ? 'bg-emerald-500' : 'bg-violet-500'
                      }`}
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-3 text-xs">
                    <div className="p-3 rounded-xl bg-slate-900 border border-slate-800/80">
                      <span className="text-slate-400 block text-[11px]">
                        Já Pago
                      </span>
                      <span className="font-bold text-white text-sm">
                        {formatBRL(plan.totalPaidSoFar)}
                      </span>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-900 border border-slate-800/80">
                      <span className="text-slate-400 block text-[11px]">
                        Falta Pagar ({plan.remainingCount}x)
                      </span>
                      <span className="font-bold text-amber-300 text-sm">
                        {formatBRL(plan.projectedRemainingAmount)}
                      </span>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-900 border border-slate-800/80">
                      <span className="text-slate-400 block text-[11px]">
                        Valor Total
                      </span>
                      <span className="font-bold text-slate-200 text-sm">
                        {formatBRL(
                          plan.totalPaidSoFar +
                            plan.projectedRemainingAmount -
                            plan.anticipationDiscount
                        )}
                      </span>
                    </div>
                  </div>

                  {plan.anticipationDiscount > 0 && (
                    <div className="text-xs text-emerald-400 flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 rounded-xl">
                      <Sparkles className="w-4 h-4 shrink-0" />
                      <span>
                        Parcelas antecipadas com desconto de{' '}
                        <strong>{formatBRL(plan.anticipationDiscount)}</strong>
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
