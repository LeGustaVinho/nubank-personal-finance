import React, { useMemo, useState, useEffect } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
} from 'recharts';
import {
  Search,
  Layers,
  ChevronDown,
  ChevronUp,
  Plus,
  Merge,
  Tag,
  CreditCard,
  Landmark,
  SlidersHorizontal,
  Trash2,
  CheckSquare,
  Square,
  BarChart3,
} from 'lucide-react';
import { UnifiedTransaction, GroupingRule } from '../../server/types';
import {
  formatBRL,
  formatCompactBRL,
  formatDateBR,
  formatMonthShort,
  formatMonthFull,
  getCategoryColor,
} from '../utils/formatters';

interface MerchantGroupsViewProps {
  transactions: UnifiedTransaction[];
  allTransactions?: UnifiedTransaction[];
  rules: GroupingRule[];
  categories: string[];
  focusedGroup: string | null;
  onClearFocusedGroup: () => void;
  onSaveRule: (
    rule: Partial<GroupingRule> & {
      merchantGroup: string;
      category: string;
      patterns: string[];
    }
  ) => Promise<void>;
  onDeleteRule: (ruleId: string) => Promise<void>;
}

interface MonthlyGroupPoint {
  month: string;
  label: string;
  fullLabel: string;
  Cartao: number;
  Conta: number;
  Receita: number;
  Total: number;
  count: number;
}

interface AggregatedMerchantGroup {
  merchantGroup: string;
  category: string;
  matchedRuleId: string | null;
  grossExpense: number;
  iofTotal: number;
  refundTotal: number;
  netExpense: number;
  incomeTotal: number;
  purchaseCount: number;
  ccNet: number;
  bankNet: number;
  rawVariants: Map<string, { count: number; total: number }>;
  monthlyBreakdown: Map<string, number>;
  items: UnifiedTransaction[];
}

export const MerchantGroupsView: React.FC<MerchantGroupsViewProps> = ({
  transactions,
  allTransactions,
  rules,
  categories,
  focusedGroup,
  onClearFocusedGroup,
  onSaveRule,
  onDeleteRule,
}) => {
  const fullHistoryTransactions = allTransactions || transactions;

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState<
    'netExpense' | 'purchaseCount' | 'avgTicket' | 'name'
  >('netExpense');
  const [expandedGroup, setExpandedGroup] = useState<string | null>(focusedGroup);
  const [selectedForMerge, setSelectedForMerge] = useState<Set<string>>(new Set());
  const [showRulesModal, setShowRulesModal] = useState(false);

  // Merge / New Rule Modal state
  const [editingRule, setEditingRule] = useState<{
    id?: string;
    merchantGroup: string;
    category: string;
    patternsText: string;
  } | null>(null);

  useEffect(() => {
    if (focusedGroup) {
      setExpandedGroup(focusedGroup);
      setSearch(focusedGroup);
    }
  }, [focusedGroup]);

  // All timeline months across the full dataset so monthly charts show Jan..Nov/Dec consistently
  const allTimelineMonths = useMemo(() => {
    const set = new Set<string>();
    for (const tx of fullHistoryTransactions) {
      if (tx.competenceMonth) set.add(tx.competenceMonth);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [fullHistoryTransactions]);

  // Helper to build the full month-by-month chart series for any merchantGroup using fullHistoryTransactions
  const buildGroupMonthlySeries = useMemo(() => {
    const byGroup = new Map<string, Map<string, MonthlyGroupPoint>>();

    for (const tx of fullHistoryTransactions) {
      if (
        tx.flowKind === 'cc_payment' ||
        tx.flowKind === 'internal_transfer' ||
        tx.flowKind === 'investment'
      )
        continue;
      const g = tx.merchantGroup;
      if (!byGroup.has(g)) {
        const mMap = new Map<string, MonthlyGroupPoint>();
        for (const m of allTimelineMonths) {
          mMap.set(m, {
            month: m,
            label: formatMonthShort(m),
            fullLabel: formatMonthFull(m),
            Cartao: 0,
            Conta: 0,
            Receita: 0,
            Total: 0,
            count: 0,
          });
        }
        byGroup.set(g, mMap);
      }

      const mMap = byGroup.get(g)!;
      const pt = mMap.get(tx.competenceMonth);
      if (!pt) continue;

      if (tx.flowKind === 'expense' || tx.flowKind === 'iof') {
        const val = Math.abs(tx.rawAmount);
        if (tx.source === 'creditCard') pt.Cartao += val;
        else pt.Conta += val;
        pt.Total += val;
        if (tx.flowKind === 'expense') pt.count += 1;
      } else if (tx.flowKind === 'refund') {
        const val = Math.abs(tx.rawAmount);
        if (tx.source === 'creditCard') pt.Cartao -= val;
        else pt.Conta -= val;
        pt.Total -= val;
      } else if (tx.flowKind === 'income') {
        pt.Receita += tx.incomeAmount;
        pt.Total += tx.incomeAmount;
        pt.count += 1;
      }
    }

    return (groupName: string): MonthlyGroupPoint[] => {
      const mMap = byGroup.get(groupName);
      if (!mMap) {
        return allTimelineMonths.map((m) => ({
          month: m,
          label: formatMonthShort(m),
          fullLabel: formatMonthFull(m),
          Cartao: 0,
          Conta: 0,
          Receita: 0,
          Total: 0,
          count: 0,
        }));
      }
      return Array.from(mMap.values()).map((pt) => ({
        ...pt,
        Cartao: Math.max(0, Math.round(pt.Cartao * 100) / 100),
        Conta: Math.max(0, Math.round(pt.Conta * 100) / 100),
        Receita: Math.max(0, Math.round(pt.Receita * 100) / 100),
        Total: Math.max(0, Math.round(pt.Total * 100) / 100),
      }));
    };
  }, [fullHistoryTransactions, allTimelineMonths]);

  const groups = useMemo(() => {
    const map = new Map<string, AggregatedMerchantGroup>();

    for (const tx of transactions) {
      // Ignore neutral invoice payments and RDB movements in shopping groups
      if (
        tx.flowKind === 'cc_payment' ||
        tx.flowKind === 'internal_transfer' ||
        tx.flowKind === 'investment'
      )
        continue;

      const key = tx.merchantGroup;
      if (!map.has(key)) {
        map.set(key, {
          merchantGroup: key,
          category: tx.category,
          matchedRuleId: tx.matchedRuleId,
          grossExpense: 0,
          iofTotal: 0,
          refundTotal: 0,
          netExpense: 0,
          incomeTotal: 0,
          purchaseCount: 0,
          ccNet: 0,
          bankNet: 0,
          rawVariants: new Map(),
          monthlyBreakdown: new Map(),
          items: [],
        });
      }

      const g = map.get(key)!;
      g.items.push(tx);

      if (tx.flowKind === 'expense') {
        const val = Math.abs(tx.rawAmount);
        g.grossExpense += val;
        g.netExpense += val;
        g.purchaseCount += 1;
        if (tx.source === 'creditCard') g.ccNet += val;
        else g.bankNet += val;
      } else if (tx.flowKind === 'iof') {
        const val = Math.abs(tx.rawAmount);
        g.iofTotal += val;
        g.netExpense += val;
        if (tx.source === 'creditCard') g.ccNet += val;
        else g.bankNet += val;
      } else if (tx.flowKind === 'refund') {
        const val = Math.abs(tx.rawAmount);
        g.refundTotal += val;
        g.netExpense -= val;
        if (tx.source === 'creditCard') g.ccNet -= val;
        else g.bankNet -= val;
      } else if (tx.flowKind === 'income') {
        g.incomeTotal += tx.incomeAmount;
      }

      // Track raw variant name
      const variantName =
        tx.source === 'creditCard'
          ? tx.rawDescription
          : `${tx.operationType}: ${tx.extractedCounterparty}`;
      const prevVar = g.rawVariants.get(variantName) || { count: 0, total: 0 };
      prevVar.count += 1;
      prevVar.total += tx.expenseAmount !== 0 ? tx.expenseAmount : tx.incomeAmount;
      g.rawVariants.set(variantName, prevVar);

      // Monthly breakdown
      const m = tx.competenceMonth;
      g.monthlyBreakdown.set(
        m,
        (g.monthlyBreakdown.get(m) || 0) +
          (tx.expenseAmount !== 0 ? tx.expenseAmount : tx.incomeAmount)
      );
    }

    let list = Array.from(map.values());

    if (categoryFilter !== 'ALL') {
      list = list.filter((g) => g.category === categoryFilter);
    }

    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter(
        (g) =>
          g.merchantGroup.toLowerCase().includes(q) ||
          g.category.toLowerCase().includes(q) ||
          Array.from(g.rawVariants.keys()).some((v) => v.toLowerCase().includes(q))
      );
    }

    list.sort((a, b) => {
      if (sortBy === 'netExpense') {
        const valA = a.netExpense > 0 ? a.netExpense : a.incomeTotal;
        const valB = b.netExpense > 0 ? b.netExpense : b.incomeTotal;
        return valB - valA;
      }
      if (sortBy === 'purchaseCount') return b.purchaseCount - a.purchaseCount;
      if (sortBy === 'avgTicket') {
        const avgA = a.purchaseCount > 0 ? a.netExpense / a.purchaseCount : 0;
        const avgB = b.purchaseCount > 0 ? b.netExpense / b.purchaseCount : 0;
        return avgB - avgA;
      }
      return a.merchantGroup.localeCompare(b.merchantGroup);
    });

    return list;
  }, [transactions, categoryFilter, search, sortBy]);

  // Active group for the top interactive chart (either expandedGroup or the #1 expense group in the current filtered list)
  const chartTargetGroup = useMemo(() => {
    if (expandedGroup) {
      const found = groups.find((g) => g.merchantGroup === expandedGroup);
      if (found) return found;
    }
    const firstExpenseGroup = groups.find((g) => g.netExpense > 0);
    return firstExpenseGroup || groups[0] || null;
  }, [expandedGroup, groups]);

  const chartTargetSeries = useMemo(() => {
    if (!chartTargetGroup) return [];
    return buildGroupMonthlySeries(chartTargetGroup.merchantGroup);
  }, [chartTargetGroup, buildGroupMonthlySeries]);

  const chartTargetStats = useMemo(() => {
    const activeMonths = chartTargetSeries.filter((p) => p.Total > 0);
    const grandTotal = chartTargetSeries.reduce((s, p) => s + p.Total, 0);
    const avgActive = activeMonths.length > 0 ? grandTotal / activeMonths.length : 0;
    const peak =
      activeMonths.length > 0
        ? [...activeMonths].sort((a, b) => b.Total - a.Total)[0]
        : null;
    return {
      activeMonthsCount: activeMonths.length,
      grandTotal,
      avgActive,
      peak,
    };
  }, [chartTargetSeries]);

  const toggleSelectGroup = (groupName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = new Set(selectedForMerge);
    if (next.has(groupName)) next.delete(groupName);
    else next.add(groupName);
    setSelectedForMerge(next);
  };

  const openMergeSelectedModal = () => {
    const selectedGroups = groups.filter((g) => selectedForMerge.has(g.merchantGroup));
    if (selectedGroups.length === 0) return;

    const first = selectedGroups[0];
    const allPatterns = new Set<string>();
    for (const g of selectedGroups) {
      allPatterns.add(g.merchantGroup);
      for (const tx of g.items) {
        allPatterns.add(tx.extractedCounterparty);
      }
    }

    setEditingRule({
      merchantGroup: first.merchantGroup,
      category: first.category,
      patternsText: Array.from(allPatterns).join(', '),
    });
  };

  const openEditGroupRule = (group: AggregatedMerchantGroup, e: React.MouseEvent) => {
    e.stopPropagation();
    const existingRule = rules.find((r) => r.id === group.matchedRuleId);
    if (existingRule) {
      setEditingRule({
        id: existingRule.id,
        merchantGroup: existingRule.merchantGroup,
        category: existingRule.category,
        patternsText: existingRule.patterns.join(', '),
      });
    } else {
      const patterns = new Set<string>([group.merchantGroup]);
      for (const tx of group.items) {
        patterns.add(tx.extractedCounterparty);
      }
      setEditingRule({
        merchantGroup: group.merchantGroup,
        category: group.category,
        patternsText: Array.from(patterns).join(', '),
      });
    }
  };

  const handleSaveRuleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRule) return;
    const patterns = editingRule.patternsText
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    if (!editingRule.merchantGroup.trim() || patterns.length === 0) return;

    await onSaveRule({
      id: editingRule.id,
      merchantGroup: editingRule.merchantGroup.trim(),
      category: editingRule.category,
      patterns,
    });
    setEditingRule(null);
    setSelectedForMerge(new Set());
  };

  return (
    <div className="space-y-5">
      {/* Header & Controls */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Layers className="w-5 h-5 text-violet-400" />
              <span>Agrupamento Inteligente de Compras & Estabelecimentos</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Unifica automaticamente nomes fragmentados (como <em>Dl*Uberrides</em> +{' '}
              <em>Uber *Trip</em> ou <em>Ifd*...</em> + <em>iFood NuPay</em>), soma IOF e
              abate estornos.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {selectedForMerge.size > 0 && (
              <button
                onClick={openMergeSelectedModal}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow transition cursor-pointer"
              >
                <Merge className="w-4 h-4" />
                <span>Agrupar {selectedForMerge.size} selecionados</span>
              </button>
            )}

            <button
              onClick={() =>
                setEditingRule({
                  merchantGroup: '',
                  category: categories[0] || 'Compras & E-commerce',
                  patternsText: '',
                })
              }
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold shadow transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Nova Regra de Agrupamento</span>
            </button>

            <button
              onClick={() => setShowRulesModal(!showRulesModal)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium transition cursor-pointer"
            >
              <SlidersHorizontal className="w-4 h-4" />
              <span>Regras Ativas ({rules.length})</span>
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-5 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                if (focusedGroup) onClearFocusedGroup();
              }}
              placeholder="Buscar grupo ou descrição original (ex: Uber, iFood, Saito, OpenAI, Araujo...)"
              className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-violet-500"
            />
            {search && (
              <button
                onClick={() => {
                  setSearch('');
                  onClearFocusedGroup();
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white cursor-pointer"
              >
                Limpar
              </button>
            )}
          </div>

          <div className="md:col-span-4">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-violet-500"
            >
              <option value="ALL">Todas as Categorias ({categories.length})</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-3">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-violet-500"
            >
              <option value="netExpense">Ordenar por: Maior Valor Total</option>
              <option value="purchaseCount">Ordenar por: Maior Frequência (Qtd)</option>
              <option value="avgTicket">Ordenar por: Maior Ticket Médio</option>
              <option value="name">Ordenar por: Ordem Alfabética (A-Z)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Interactive Month-by-Month Chart Panel for Selected Group */}
      {chartTargetGroup && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div
                className="p-2.5 rounded-xl"
                style={{
                  backgroundColor: `${getCategoryColor(chartTargetGroup.category)}20`,
                  color: getCategoryColor(chartTargetGroup.category),
                }}
              >
                <BarChart3 className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-base font-bold text-white">
                    Gráfico Mês a Mês do Grupo:{' '}
                    <span className="text-violet-300">
                      {chartTargetGroup.merchantGroup}
                    </span>
                  </h3>
                  <span
                    className="px-2.5 py-0.5 rounded-full text-[11px] font-medium"
                    style={{
                      backgroundColor: `${getCategoryColor(
                        chartTargetGroup.category
                      )}20`,
                      color: getCategoryColor(chartTargetGroup.category),
                    }}
                  >
                    {chartTargetGroup.category}
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Evolução mensal deste estabelecimento/grupo ao longo do ano (Cartão de Crédito + Conta Corrente)
                </p>
              </div>
            </div>

            {/* Quick Group Selector */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Grupo no gráfico:</span>
              <select
                value={chartTargetGroup.merchantGroup}
                onChange={(e) => setExpandedGroup(e.target.value)}
                className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs font-semibold text-white focus:outline-none focus:border-violet-500 cursor-pointer max-w-xs"
              >
                {groups.map((g) => (
                  <option key={g.merchantGroup} value={g.merchantGroup}>
                    {g.merchantGroup} (
                    {formatBRL(
                      g.netExpense > 0 ? g.netExpense : g.incomeTotal
                    )}
                    )
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 4 Summary KPIs for the Selected Group */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800">
              <span className="text-[11px] text-slate-400 block">
                Total Acumulado no Ano
              </span>
              <span className="text-sm font-bold text-white mt-0.5 block">
                {formatBRL(chartTargetStats.grandTotal)}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800">
              <span className="text-[11px] text-slate-400 block">
                Média nos Meses Ativos ({chartTargetStats.activeMonthsCount}m)
              </span>
              <span className="text-sm font-bold text-violet-300 mt-0.5 block">
                {formatBRL(chartTargetStats.avgActive)}/mês
              </span>
            </div>
            <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800">
              <span className="text-[11px] text-slate-400 block">Mês de Pico</span>
              <span className="text-sm font-bold text-rose-300 mt-0.5 block">
                {chartTargetStats.peak
                  ? `${chartTargetStats.peak.label} (${formatBRL(
                      chartTargetStats.peak.Total
                    )})`
                  : '—'}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800">
              <span className="text-[11px] text-slate-400 block">
                Frequência & Ticket Médio
              </span>
              <span className="text-sm font-bold text-emerald-300 mt-0.5 block">
                {chartTargetGroup.purchaseCount}x •{' '}
                {chartTargetGroup.purchaseCount > 0
                  ? formatBRL(
                      chartTargetGroup.netExpense / chartTargetGroup.purchaseCount
                    )
                  : formatBRL(chartTargetStats.grandTotal)}
              </span>
            </div>
          </div>

          {/* Recharts BarChart for the Selected Group */}
          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartTargetSeries}
                margin={{ top: 10, right: 15, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="label" stroke="#94a3b8" fontSize={12} />
                <YAxis
                  stroke="#94a3b8"
                  fontSize={11}
                  tickFormatter={(v) => formatCompactBRL(v)}
                />
                {chartTargetStats.avgActive > 0 && (
                  <ReferenceLine
                    y={chartTargetStats.avgActive}
                    stroke="#f59e0b"
                    strokeDasharray="4 4"
                    label={{
                      value: `Média: ${formatCompactBRL(chartTargetStats.avgActive)}`,
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
                  formatter={(value: any, name: string) => [
                    formatBRL(Number(value)),
                    name,
                  ]}
                />
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '6px' }} />
                {chartTargetGroup.netExpense <= 0 &&
                  chartTargetGroup.incomeTotal > 0 && (
                    <Bar
                      dataKey="Receita"
                      name="Recebido na Conta"
                      fill="#10b981"
                      radius={[4, 4, 0, 0]}
                    />
                  )}
                {(chartTargetGroup.netExpense > 0 ||
                  chartTargetGroup.incomeTotal <= 0) && (
                  <Bar
                    dataKey="Cartao"
                    name="No Cartão de Crédito"
                    stackId="group"
                    fill="#8b5cf6"
                  />
                )}
                {(chartTargetGroup.netExpense > 0 ||
                  chartTargetGroup.incomeTotal <= 0) && (
                  <Bar
                    dataKey="Conta"
                    name="Na Conta Corrente (Pix/Boleto/Débito)"
                    stackId="group"
                    fill="#0ea5e9"
                    radius={[4, 4, 0, 0]}
                  />
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Rules Manager Drawer if toggled */}
      {showRulesModal && (
        <div className="bg-slate-900/95 border border-violet-500/40 rounded-2xl p-5 shadow-xl space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">
              Gerenciador de Regras de Agrupamento ({rules.length} regras configuradas)
            </h3>
            <button
              onClick={() => setShowRulesModal(false)}
              className="text-xs text-slate-400 hover:text-white cursor-pointer"
            >
              Fechar
            </button>
          </div>
          <div className="max-h-72 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-2.5 pr-1">
            {rules.map((r) => (
              <div
                key={r.id}
                className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 flex items-start justify-between gap-2 text-xs"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white">{r.merchantGroup}</span>
                    <span
                      className="px-2 py-0.5 rounded-full text-[10px]"
                      style={{
                        backgroundColor: `${getCategoryColor(r.category)}20`,
                        color: getCategoryColor(r.category),
                      }}
                    >
                      {r.category}
                    </span>
                  </div>
                  <p className="text-slate-400 text-[11px] break-words">
                    Padrões: <code className="text-violet-300">{r.patterns.join(' | ')}</code>
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() =>
                      setEditingRule({
                        id: r.id,
                        merchantGroup: r.merchantGroup,
                        category: r.category,
                        patternsText: r.patterns.join(', '),
                      })
                    }
                    className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] cursor-pointer"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => onDeleteRule(r.id)}
                    className="p-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 cursor-pointer"
                    title="Excluir regra"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create / Edit Rule Modal */}
      {editingRule && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveRuleSubmit}
            className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4"
          >
            <h3 className="text-base font-bold text-white">
              {editingRule.id ? 'Editar Regra de Agrupamento' : 'Criar / Unir Grupo de Compras'}
            </h3>

            <div>
              <label className="block text-xs text-slate-300 mb-1 font-medium">
                Nome Canônico do Grupo / Estabelecimento
              </label>
              <input
                type="text"
                required
                value={editingRule.merchantGroup}
                onChange={(e) =>
                  setEditingRule({ ...editingRule, merchantGroup: e.target.value })
                }
                placeholder="Ex: Uber, iFood, Farmácias, Padaria..."
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-300 mb-1 font-medium">
                Categoria Financeira
              </label>
              <select
                value={editingRule.category}
                onChange={(e) =>
                  setEditingRule({ ...editingRule, category: e.target.value })
                }
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white"
              >
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-slate-300 mb-1 font-medium">
                Termos ou Prefixos que pertencem a este grupo (separados por vírgula)
              </label>
              <textarea
                rows={3}
                required
                value={editingRule.patternsText}
                onChange={(e) =>
                  setEditingRule({ ...editingRule, patternsText: e.target.value })
                }
                placeholder="Ex: Dl*Uberrides, Uber *Trip, Uber*"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Qualquer transação futura ou passada cujo título ou contraparte contenha um destes
                termos será automaticamente agrupada aqui.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingRule(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-xs text-slate-300 hover:bg-slate-700 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-xs font-semibold text-white cursor-pointer"
              >
                Salvar Regra e Reagrupar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Groups Accordion List */}
      <div className="space-y-3">
        {groups.map((g) => {
          const isExpanded = expandedGroup === g.merchantGroup;
          const isSelected = selectedForMerge.has(g.merchantGroup);
          const avgTicket = g.purchaseCount > 0 ? g.netExpense / g.purchaseCount : 0;
          const isIncomeGroup = g.netExpense <= 0 && g.incomeTotal > 0;
          const groupMonthlySeries = isExpanded
            ? buildGroupMonthlySeries(g.merchantGroup)
            : [];
          const activeMonthsInGroup = groupMonthlySeries.filter((m) => m.Total > 0);
          const groupAvgMonth =
            activeMonthsInGroup.length > 0
              ? groupMonthlySeries.reduce((s, m) => s + m.Total, 0) /
                activeMonthsInGroup.length
              : 0;

          return (
            <div
              key={g.merchantGroup}
              className={`bg-slate-900/90 border rounded-2xl transition shadow ${
                isExpanded
                  ? 'border-violet-500/60 ring-1 ring-violet-500/30'
                  : 'border-slate-800 hover:border-slate-700'
              }`}
            >
              {/* Summary Header Row */}
              <div
                onClick={() =>
                  setExpandedGroup(isExpanded ? null : g.merchantGroup)
                }
                className="p-4 flex flex-wrap items-center justify-between gap-4 cursor-pointer"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    onClick={(e) => toggleSelectGroup(g.merchantGroup, e)}
                    className="text-slate-400 hover:text-violet-400 cursor-pointer"
                    title="Selecionar para unir com outro grupo"
                  >
                    {isSelected ? (
                      <CheckSquare className="w-4 h-4 text-violet-400" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>

                  <div>
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="text-base font-bold text-white">
                        {g.merchantGroup}
                      </span>
                      <span
                        className="px-2.5 py-0.5 rounded-full text-xs font-medium"
                        style={{
                          backgroundColor: `${getCategoryColor(g.category)}20`,
                          color: getCategoryColor(g.category),
                        }}
                      >
                        {g.category}
                      </span>
                    </div>

                    <div className="text-xs text-slate-400 mt-1">
                      {g.purchaseCount} {g.purchaseCount === 1 ? 'compra' : 'compras'}
                      {g.rawVariants.size > 1
                        ? ` • ${g.rawVariants.size} variações de nome unificadas`
                        : ''}
                    </div>
                  </div>
                </div>

                {/* Right-side Metrics */}
                <div className="flex items-center gap-5 ml-auto">
                  {!isIncomeGroup && (
                    <div className="hidden sm:flex items-center gap-4 text-xs text-slate-400">
                      {g.ccNet > 0 && (
                        <div className="flex items-center gap-1 text-violet-300">
                          <CreditCard className="w-3.5 h-3.5" />
                          <span>{formatBRL(g.ccNet)}</span>
                        </div>
                      )}
                      {g.bankNet > 0 && (
                        <div className="flex items-center gap-1 text-sky-300">
                          <Landmark className="w-3.5 h-3.5" />
                          <span>{formatBRL(g.bankNet)}</span>
                        </div>
                      )}
                      {avgTicket > 0 && (
                        <div className="text-right">
                          <span className="block text-[10px] text-slate-500">Ticket Médio</span>
                          <span className="font-medium text-slate-300">
                            {formatBRL(avgTicket)}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="text-right">
                    <span className="block text-[10px] text-slate-400 uppercase">
                      {isIncomeGroup ? 'Total Recebido' : 'Gasto Líquido'}
                    </span>
                    <span
                      className={`text-base font-bold ${
                        isIncomeGroup ? 'text-emerald-400' : 'text-white'
                      }`}
                    >
                      {formatBRL(isIncomeGroup ? g.incomeTotal : g.netExpense)}
                    </span>
                  </div>

                  <button
                    onClick={(e) => openEditGroupRule(g, e)}
                    className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs cursor-pointer"
                    title="Configurar Regra / Categoria deste Grupo"
                  >
                    <Tag className="w-4 h-4" />
                  </button>

                  {isExpanded ? (
                    <ChevronUp className="w-5 h-5 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-slate-400" />
                  )}
                </div>
              </div>

              {/* Expanded Details Body */}
              {isExpanded && (
                <div className="border-t border-slate-800 p-5 bg-slate-950/60 rounded-b-2xl space-y-5">
                  {/* Unified Raw Variants Strip */}
                  {g.rawVariants.size > 0 && (
                    <div>
                      <span className="text-xs font-semibold text-slate-400 block mb-2">
                        Nomes Originais nos CSVs Unificados neste Grupo:
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {Array.from(g.rawVariants.entries()).map(([variant, info]) => (
                          <span
                            key={variant}
                            className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300 font-mono"
                          >
                            {variant} <strong className="text-violet-300">({info.count}x)</strong>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Financial Composition Strip */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                      <span className="text-[11px] text-slate-400">Compras Brutas</span>
                      <div className="text-sm font-bold text-slate-200 mt-0.5">
                        {formatBRL(g.grossExpense)} ({g.purchaseCount} compras)
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                      <span className="text-[11px] text-slate-400">IOF Internacional Vinculado</span>
                      <div className="text-sm font-bold text-amber-300 mt-0.5">
                        + {formatBRL(g.iofTotal)}
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                      <span className="text-[11px] text-slate-400">Estornos / Reembolsos</span>
                      <div className="text-sm font-bold text-emerald-400 mt-0.5">
                        - {formatBRL(g.refundTotal)}
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                      <span className="text-[11px] text-slate-400">Gasto Líquido Consolidado</span>
                      <div className="text-sm font-bold text-white mt-0.5">
                        {formatBRL(g.netExpense)}
                      </div>
                    </div>
                  </div>

                  {/* Embedded Month-by-Month Chart + Pills inside the Group Card */}
                  <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                        <BarChart3 className="w-4 h-4 text-violet-400" />
                        <span>Evolução Mês a Mês em {g.merchantGroup}</span>
                      </h4>
                      {groupAvgMonth > 0 && (
                        <span className="text-[11px] text-slate-400">
                          Média nos meses com movimento:{' '}
                          <strong className="text-amber-300">
                            {formatBRL(groupAvgMonth)}/mês
                          </strong>
                        </span>
                      )}
                    </div>

                    <div className="h-52 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={groupMonthlySeries}
                          margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                          <XAxis dataKey="label" stroke="#94a3b8" fontSize={11} />
                          <YAxis
                            stroke="#94a3b8"
                            fontSize={11}
                            tickFormatter={(v) => formatCompactBRL(v)}
                          />
                          {groupAvgMonth > 0 && (
                            <ReferenceLine
                              y={groupAvgMonth}
                              stroke="#f59e0b"
                              strokeDasharray="4 4"
                            />
                          )}
                          <Tooltip
                            contentStyle={{
                              backgroundColor: '#0f172a',
                              borderColor: '#334155',
                              borderRadius: '0.75rem',
                              color: '#f8fafc',
                            }}
                            formatter={(value: any, name: string) => [
                              formatBRL(Number(value)),
                              name,
                            ]}
                          />
                          <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '4px' }} />
                          {isIncomeGroup && (
                            <Bar
                              dataKey="Receita"
                              name="Recebido na Conta"
                              fill="#10b981"
                              radius={[4, 4, 0, 0]}
                            />
                          )}
                          {!isIncomeGroup && (
                            <Bar
                              dataKey="Cartao"
                              name="No Cartão de Crédito"
                              stackId="exp"
                              fill="#8b5cf6"
                            />
                          )}
                          {!isIncomeGroup && (
                            <Bar
                              dataKey="Conta"
                              name="Na Conta Corrente (Pix/Boleto/Débito)"
                              stackId="exp"
                              fill="#0ea5e9"
                              radius={[4, 4, 0, 0]}
                            />
                          )}
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="flex flex-wrap gap-2 pt-1">
                      {Array.from(g.monthlyBreakdown.entries())
                        .sort((a, b) => a[0].localeCompare(b[0]))
                        .map(([month, val]) => (
                          <div
                            key={month}
                            className="px-3 py-1 rounded-lg bg-slate-950 border border-slate-800 text-xs"
                          >
                            <span className="text-slate-400 mr-1.5">
                              {formatMonthShort(month)}:
                            </span>
                            <span className="font-semibold text-white">
                              {formatBRL(val)}
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>

                  {/* Individual Transactions Table */}
                  <div className="max-h-80 overflow-y-auto border border-slate-800 rounded-xl">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-slate-900 sticky top-0 text-slate-400">
                        <tr>
                          <th className="py-2 px-3">Data</th>
                          <th className="py-2 px-3">Origem</th>
                          <th className="py-2 px-3">Operação</th>
                          <th className="py-2 px-3">Descrição Original no CSV</th>
                          <th className="py-2 px-3">Arquivo CSV</th>
                          <th className="py-2 px-3 text-right">Valor</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {g.items.map((tx) => (
                          <tr key={tx.id} className="hover:bg-slate-900/50">
                            <td className="py-2 px-3 font-mono text-slate-300">
                              {formatDateBR(tx.date)}
                            </td>
                            <td className="py-2 px-3">
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
                            <td className="py-2 px-3 text-slate-300">{tx.operationType}</td>
                            <td
                              className="py-2 px-3 text-slate-200 max-w-md truncate"
                              title={tx.rawDescription}
                            >
                              {tx.rawDescription}
                            </td>
                            <td className="py-2 px-3 text-slate-500 font-mono text-[11px]">
                              {tx.sourceFile}
                            </td>
                            <td
                              className={`py-2 px-3 text-right font-semibold ${
                                tx.flowKind === 'refund' || tx.flowKind === 'income'
                                  ? 'text-emerald-400'
                                  : tx.flowKind === 'iof'
                                  ? 'text-amber-300'
                                  : 'text-rose-300'
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
  );
};
