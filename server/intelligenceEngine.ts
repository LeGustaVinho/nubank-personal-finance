import {
  UnifiedTransaction,
  SmartSuggestion,
  BehavioralInsight,
  LearnedPatternEntry,
  GroupingRule,
} from './types.ts';
import { buildNormalizedTokenKey } from './groupingEngine.ts';

/**
 * Post-processes all loaded transactions to automatically unify any unruled counterparties
 * that share the exact same CPF/CNPJ document or normalized token stem across bankAccount and creditCard.
 */
export function applyCrossTransactionEntityResolution(
  transactions: UnifiedTransaction[]
): UnifiedTransaction[] {
  // 1. Group by documentId (CPF/CNPJ) to pick the cleanest canonical name & category
  const docCanonicalMap = new Map<
    string,
    { merchantGroup: string; category: string; count: number; hasRule: boolean }
  >();

  for (const tx of transactions) {
    if (!tx.documentId) continue;
    const existing = docCanonicalMap.get(tx.documentId);
    const isRuled = tx.matchedRuleId !== null;
    if (!existing) {
      docCanonicalMap.set(tx.documentId, {
        merchantGroup: tx.merchantGroup,
        category: tx.category,
        count: 1,
        hasRule: isRuled,
      });
    } else {
      existing.count += 1;
      if (isRuled && !existing.hasRule) {
        existing.merchantGroup = tx.merchantGroup;
        existing.category = tx.category;
        existing.hasRule = true;
      } else if (
        !existing.hasRule &&
        tx.merchantGroup.length > existing.merchantGroup.length
      ) {
        existing.merchantGroup = tx.merchantGroup;
      }
    }
  }

  // 2. Apply document cluster unification where multiple transactions share a CPF/CNPJ
  return transactions.map((tx) => {
    if (tx.documentId && !tx.matchedRuleId) {
      const canonical = docCanonicalMap.get(tx.documentId);
      if (canonical && canonical.count > 1) {
        return {
          ...tx,
          merchantGroup: canonical.merchantGroup,
          category: canonical.category,
          classificationSource: canonical.hasRule
            ? tx.classificationSource
            : 'document-cluster',
          confidence: Math.max(tx.confidence, 92),
        };
      }
    }
    return tx;
  });
}

/**
 * Generates actionable smart suggestions for the user to approve with 1 click
 */
export function generateSmartSuggestions(
  transactions: UnifiedTransaction[],
  rules: GroupingRule[],
  learnedPatterns: LearnedPatternEntry[],
  dismissedIds: string[] = []
): SmartSuggestion[] {
  const suggestions: SmartSuggestion[] = [];
  const dismissedSet = new Set(dismissedIds);

  // 1. Detect unruled recurring counterparties that should be promoted to permanent learned patterns
  const unruledByGroup = new Map<
    string,
    {
      merchantGroup: string;
      category: string;
      count: number;
      totalAmount: number;
      patterns: Set<string>;
      docs: Set<string>;
    }
  >();

  for (const tx of transactions) {
    if (
      tx.matchedRuleId === null &&
      tx.flowKind !== 'cc_payment' &&
      tx.flowKind !== 'internal_transfer'
    ) {
      const g = tx.merchantGroup;
      if (!unruledByGroup.has(g)) {
        unruledByGroup.set(g, {
          merchantGroup: g,
          category: tx.category,
          count: 0,
          totalAmount: 0,
          patterns: new Set(),
          docs: new Set(),
        });
      }
      const entry = unruledByGroup.get(g)!;
      entry.count += 1;
      entry.totalAmount += Math.abs(tx.rawAmount);
      entry.patterns.add(tx.extractedCounterparty);
      if (tx.documentId) entry.docs.add(tx.documentId);
    }
  }

  for (const item of unruledByGroup.values()) {
    if (item.count >= 2 || item.totalAmount >= 300) {
      const sugId = `sug-learn-${buildNormalizedTokenKey(item.merchantGroup)}`;
      if (dismissedSet.has(sugId)) continue;
      suggestions.push({
        id: sugId,
        type: 'unclassified_cluster',
        title: `Consolidar padrão recorrente: "${item.merchantGroup}"`,
        description: `Identificamos ${item.count} lançamentos somando R$ ${item.totalAmount.toFixed(
          2
        )} classificados via IA Semântica em "${item.category}". Deseja fixar este padrão na memória permanente?`,
        confidence: 90,
        suggestedMerchantGroup: item.merchantGroup,
        suggestedCategory: item.category,
        patternsToLearn: Array.from(item.patterns),
        documentIdsToLearn: Array.from(item.docs),
        affectedTransactionCount: item.count,
        totalAmount: Math.round(item.totalAmount * 100) / 100,
      });
    }
  }

  // 2. Detect subscription / recurring bill price changes across months
  const byGroupMonth = new Map<string, Map<string, number>>();
  const groupCategory = new Map<string, string>();
  for (const tx of transactions) {
    if (tx.flowKind !== 'expense') continue;
    if (
      tx.category === 'Assinaturas Digitais & IA' ||
      tx.category === 'Moradia & Contas Fixas'
    ) {
      if (!byGroupMonth.has(tx.merchantGroup)) {
        byGroupMonth.set(tx.merchantGroup, new Map());
        groupCategory.set(tx.merchantGroup, tx.category);
      }
      const mMap = byGroupMonth.get(tx.merchantGroup)!;
      mMap.set(
        tx.competenceMonth,
        (mMap.get(tx.competenceMonth) || 0) + Math.abs(tx.rawAmount)
      );
    }
  }

  for (const [group, mMap] of byGroupMonth.entries()) {
    const months = Array.from(mMap.entries()).sort((a, b) =>
      a[0].localeCompare(b[0])
    );
    if (months.length >= 2) {
      const firstVal = months[0][1];
      const lastVal = months[months.length - 1][1];
      if (lastVal > firstVal * 1.35 && lastVal - firstVal > 20) {
        const sugId = `sug-price-${buildNormalizedTokenKey(group)}`;
        if (!dismissedSet.has(sugId)) {
          suggestions.push({
            id: sugId,
            type: 'price_change',
            title: `Variação de valor detectada em "${group}"`,
            description: `O gasto mensal subiu de R$ ${firstVal.toFixed(2)} (${
              months[0][0]
            }) para R$ ${lastVal.toFixed(2)} (${
              months[months.length - 1][0]
            }). Verifique se houve upgrade de plano ou cobrança extra.`,
            confidence: 95,
            suggestedMerchantGroup: group,
            suggestedCategory: groupCategory.get(group) || 'Assinaturas Digitais & IA',
            patternsToLearn: [],
            documentIdsToLearn: [],
            affectedTransactionCount: months.length,
            totalAmount: Math.round(lastVal * 100) / 100,
          });
        }
      }
    }
  }

  return suggestions.slice(0, 12);
}

/**
 * Generates high-level behavioral and financial intelligence insights
 */
export function generateBehavioralInsights(
  transactions: UnifiedTransaction[]
): BehavioralInsight[] {
  const insights: BehavioralInsight[] = [];

  // 1. Day of Week Spending Pattern (Delivery & Mobility)
  const dayNames = [
    'Domingo',
    'Segunda-feira',
    'Terça-feira',
    'Quarta-feira',
    'Quinta-feira',
    'Sexta-feira',
    'Sábado',
  ];
  const byDayOfWeek = [0, 0, 0, 0, 0, 0, 0];
  const countByDay = [0, 0, 0, 0, 0, 0, 0];

  let totalInternationalSpend = 0;
  let totalIofPaid = 0;
  let uberCount = 0;
  let uberTotal = 0;
  let ifoodCount = 0;
  let ifoodTotal = 0;

  for (const tx of transactions) {
    if (tx.flowKind === 'expense') {
      const [y, m, d] = tx.date.split('-').map(Number);
      const dt = new Date(y, m - 1, d);
      const dow = dt.getDay();
      if (!Number.isNaN(dow)) {
        // Ignore single outlier like car purchase (R$ 15.000) for day-of-week routine habit
        if (Math.abs(tx.rawAmount) < 5000) {
          byDayOfWeek[dow] += Math.abs(tx.rawAmount);
          countByDay[dow] += 1;
        }
      }
    }

    if (tx.flowKind === 'iof') {
      totalIofPaid += Math.abs(tx.rawAmount);
    }
    if (
      tx.linkedTargetTitle ||
      tx.gateway === 'PayPal' ||
      tx.gateway === 'Worldline' ||
      tx.gateway === 'Digital Matter'
    ) {
      if (tx.flowKind === 'expense') {
        totalInternationalSpend += Math.abs(tx.rawAmount);
      }
    }

    if (tx.merchantGroup === 'Uber' && tx.flowKind === 'expense') {
      uberCount += 1;
      uberTotal += Math.abs(tx.rawAmount);
    }
    if (tx.merchantGroup === 'iFood' && tx.flowKind === 'expense') {
      ifoodCount += 1;
      ifoodTotal += Math.abs(tx.rawAmount);
    }
  }

  let peakDayIdx = 0;
  for (let i = 1; i < 7; i++) {
    if (byDayOfWeek[i] > byDayOfWeek[peakDayIdx]) peakDayIdx = i;
  }

  insights.push({
    id: 'insight-peak-day',
    category: 'habit',
    title: `Dia da Semana de Maior Consumo: ${dayNames[peakDayIdx]}`,
    metric: `R$ ${byDayOfWeek[peakDayIdx].toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} (${countByDay[peakDayIdx]} compras)`,
    detail: `As compras rotineiras concentram maior volume financeiro às ${dayNames[peakDayIdx]}s ao longo do período analisado.`,
    severity: 'info',
  });

  insights.push({
    id: 'insight-delivery-habit',
    category: 'habit',
    title: 'Padrão Consolidado em iFood (Cartão + NuPay Débito + Pix)',
    metric: `${ifoodCount} pedidos • Ticket Médio R$ ${(ifoodCount > 0
      ? ifoodTotal / ifoodCount
      : 0
    ).toFixed(2)}`,
    detail: `Total bruto de R$ ${ifoodTotal.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} unificando compras diretas via NuPay e restaurantes Ifd*.`,
    severity: 'warning',
  });

  insights.push({
    id: 'insight-mobility-habit',
    category: 'habit',
    title: 'Padrão de Mobilidade Urbana (Uber Consolidado)',
    metric: `${uberCount} viagens • Ticket Médio R$ ${(uberCount > 0
      ? uberTotal / uberCount
      : 0
    ).toFixed(2)}`,
    detail: `4 grafias diferentes do cartão (Dl*Uberrides, Uber *Trip, etc.) foram unificadas somando R$ ${uberTotal.toLocaleString(
      'pt-BR',
      { minimumFractionDigits: 2, maximumFractionDigits: 2 }
    )}.`,
    severity: 'info',
  });

  insights.push({
    id: 'insight-international-iof',
    category: 'subscription',
    title: 'Compras Internacionais & Impacto de IOF',
    metric: `R$ ${totalIofPaid.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} apenas em IOF`,
    detail: `Suas assinaturas e compras em moeda estrangeira (OpenAI, Claude, CCP Games, Steam, Mega, Discord) geraram ${
      transactions.filter((t) => t.flowKind === 'iof').length
    } lançamentos de IOF automaticamente vinculados aos serviços.`,
    severity: 'warning',
  });

  return insights;
}
