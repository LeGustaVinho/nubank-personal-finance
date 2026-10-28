import fs from 'node:fs';
import path from 'node:path';
import {
  UserConfigStore,
  GroupingRule,
  TransactionOverride,
  LearnedPatternEntry,
  FlowKind,
  CostTypeOverrideValue,
} from './types.ts';
import { DEFAULT_GROUPING_RULES, buildNormalizedTokenKey } from './groupingEngine.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'user-config.json');

export function loadUserConfig(): UserConfigStore {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(CONFIG_FILE)) {
    const initial: UserConfigStore = {
      rules: DEFAULT_GROUPING_RULES,
      learnedPatterns: [],
      dismissedSuggestions: [],
      overrides: {},
      categoryBudgets: {},
    };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(initial, null, 2), 'utf-8');
    return initial;
  }

  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<UserConfigStore>;

    const savedRules = Array.isArray(parsed.rules) ? parsed.rules : [];
    const customRules = savedRules.filter((r) => r.isCustom);
    const customIds = new Set(customRules.map((r) => r.id));

    // Always keep default rules up-to-date while preserving user's custom rules on top
    const mergedRules: GroupingRule[] = [
      ...customRules,
      ...DEFAULT_GROUPING_RULES.filter((r) => !customIds.has(r.id)),
    ];

    return {
      rules: mergedRules,
      learnedPatterns: Array.isArray(parsed.learnedPatterns) ? parsed.learnedPatterns : [],
      dismissedSuggestions: Array.isArray(parsed.dismissedSuggestions)
        ? parsed.dismissedSuggestions
        : [],
      overrides: parsed.overrides || {},
      categoryBudgets: parsed.categoryBudgets || {},
      costTypeOverrides: parsed.costTypeOverrides || {},
      currentBankBalance:
        typeof parsed.currentBankBalance === 'number' && !Number.isNaN(parsed.currentBankBalance)
          ? parsed.currentBankBalance
          : null,
    };
  } catch {
    return {
      rules: DEFAULT_GROUPING_RULES,
      learnedPatterns: [],
      dismissedSuggestions: [],
      overrides: {},
      categoryBudgets: {},
      costTypeOverrides: {},
      currentBankBalance: null,
    };
  }
}

export function saveUserConfig(config: UserConfigStore): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

export function upsertRule(rule: GroupingRule): UserConfigStore {
  const config = loadUserConfig();
  const idx = config.rules.findIndex((r) => r.id === rule.id);
  const now = new Date().toISOString();
  if (idx >= 0) {
    config.rules[idx] = {
      ...config.rules[idx],
      ...rule,
      isCustom: true,
      learnedCount: (config.rules[idx].learnedCount || 1) + 1,
      updatedAt: now,
    };
  } else {
    config.rules.unshift({
      ...rule,
      isCustom: true,
      learnedCount: 1,
      updatedAt: now,
    });
  }
  saveUserConfig(config);
  return config;
}

export function deleteRule(ruleId: string): UserConfigStore {
  const config = loadUserConfig();
  config.rules = config.rules.filter((r) => r.id !== ruleId);
  saveUserConfig(config);
  return config;
}

/**
 * Automatically teaches the intelligence engine whenever the user classifies a transaction or approves a pattern
 */
export function learnPatternFromUser(params: {
  merchantGroup: string;
  category: string;
  rawCounterparty: string;
  documentId?: string | null;
  flowKind?: FlowKind;
}): UserConfigStore {
  const config = loadUserConfig();
  const now = new Date().toISOString();

  // 1. If there is a CPF/CNPJ documentId, learn it with 99% priority
  if (params.documentId) {
    const existingDocIdx = config.learnedPatterns.findIndex(
      (lp) => lp.keyType === 'document' && lp.keyValue === params.documentId
    );
    const entry: LearnedPatternEntry = {
      id: `learn-doc-${params.documentId.replace(/[^0-9]/g, '')}`,
      keyType: 'document',
      keyValue: params.documentId,
      merchantGroup: params.merchantGroup,
      category: params.category,
      flowKind: params.flowKind,
      learnedFromSample: params.rawCounterparty,
      createdAt: now,
      hitCount: 1,
    };
    if (existingDocIdx >= 0) {
      config.learnedPatterns[existingDocIdx] = entry;
    } else {
      config.learnedPatterns.unshift(entry);
    }
  }

  // 2. Learn the normalized token signature
  const tokenKey = buildNormalizedTokenKey(params.rawCounterparty);
  if (tokenKey.length >= 3) {
    const existingTokenIdx = config.learnedPatterns.findIndex(
      (lp) => lp.keyType === 'token' && lp.keyValue === tokenKey
    );
    const entry: LearnedPatternEntry = {
      id: `learn-tok-${tokenKey.replace(/\s+/g, '-')}`,
      keyType: 'token',
      keyValue: tokenKey,
      merchantGroup: params.merchantGroup,
      category: params.category,
      flowKind: params.flowKind,
      learnedFromSample: params.rawCounterparty,
      createdAt: now,
      hitCount: 1,
    };
    if (existingTokenIdx >= 0) {
      config.learnedPatterns[existingTokenIdx] = entry;
    } else {
      config.learnedPatterns.unshift(entry);
    }
  }

  saveUserConfig(config);
  return config;
}

export function deleteLearnedPattern(patternId: string): UserConfigStore {
  const config = loadUserConfig();
  config.learnedPatterns = config.learnedPatterns.filter((lp) => lp.id !== patternId);
  saveUserConfig(config);
  return config;
}

export function dismissSuggestion(suggestionId: string): UserConfigStore {
  const config = loadUserConfig();
  if (!config.dismissedSuggestions.includes(suggestionId)) {
    config.dismissedSuggestions.push(suggestionId);
    saveUserConfig(config);
  }
  return config;
}

export function setTransactionOverride(
  txId: string,
  override: TransactionOverride
): UserConfigStore {
  const config = loadUserConfig();
  config.overrides[txId] = {
    ...(config.overrides[txId] || {}),
    ...override,
  };
  saveUserConfig(config);
  return config;
}

export function setMerchantCostTypeOverride(
  merchantGroup: string,
  costType: CostTypeOverrideValue | null
): UserConfigStore {
  const config = loadUserConfig();
  if (!config.costTypeOverrides) {
    config.costTypeOverrides = {};
  }
  if (!costType) {
    delete config.costTypeOverrides[merchantGroup];
  } else {
    config.costTypeOverrides[merchantGroup] = costType;
  }
  saveUserConfig(config);
  return config;
}

export function setCurrentBankBalance(balance: number | null): UserConfigStore {
  const config = loadUserConfig();
  config.currentBankBalance =
    typeof balance === 'number' && !Number.isNaN(balance)
      ? Math.round(balance * 100) / 100
      : null;
  saveUserConfig(config);
  return config;
}
