import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { UnifiedTransaction, GroupingRule, LearnedPatternEntry } from './types.ts';
import { DEFAULT_CATEGORIES } from './groupingEngine.ts';

export interface AgyCliStatus {
  available: boolean;
  executablePath: string | null;
  version: string | null;
  supportedModels: Array<{ id: string; label: string; effort: 'low' | 'medium' | 'high' }>;
}

export interface AgyAiClassificationItem {
  rawSample: string;
  extractedCounterparty: string;
  documentId?: string | null;
  suggestedMerchantGroup: string;
  suggestedCategory: string;
  patterns: string[];
  reasoning: string;
  confidence: number;
}

export interface AgyAiBatchResult {
  status: 'SUCCESS' | 'ERROR';
  observedModel: string | null;
  observedEffort: string | null;
  sessionId: string | null;
  classifications: AgyAiClassificationItem[];
  financialSummaryAdvice?: string;
  rawResponse?: string;
  error?: string;
  durationMs: number;
}

export const AGY_SUPPORTED_MODELS: Array<{
  id: string;
  label: string;
  effort: 'low' | 'medium' | 'high';
}> = [
  { id: 'gemini-3.8-flash-low', label: 'Gemini 3.8 Flash (Low - Rápido)', effort: 'low' },
  { id: 'gemini-3.8-flash-medium', label: 'Gemini 3.8 Flash (Medium)', effort: 'medium' },
  { id: 'gemini-4-argon-low', label: 'Gemini 4 Argon (Low)', effort: 'low' },
  { id: 'gemini-4-argon-medium', label: 'Gemini 4 Argon (Medium - Profundo)', effort: 'medium' },
];

/**
 * Resolves the local Antigravity (`agy`) executable path on Windows/Unix
 */
export function resolveAgyExecutable(): string | null {
  const localAppData =
    process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const candidatePaths = [
    path.join(localAppData, 'agy', 'bin', 'agy.exe'),
    path.join(os.homedir(), '.local', 'bin', 'agy'),
  ];

  for (const p of candidatePaths) {
    if (fs.existsSync(p)) return p;
  }

  try {
    const out = execFileSync(process.platform === 'win32' ? 'where.exe' : 'which', ['agy'], {
      encoding: 'utf-8',
      timeout: 3000,
    });
    const firstLine = out.split(/\r?\n/)[0]?.trim();
    if (firstLine && fs.existsSync(firstLine)) return firstLine;
  } catch {
    // ignore
  }

  return null;
}

export function getAgyCliStatus(): AgyCliStatus {
  const exe = resolveAgyExecutable();
  if (!exe) {
    return {
      available: false,
      executablePath: null,
      version: null,
      supportedModels: AGY_SUPPORTED_MODELS,
    };
  }

  let version = '1.4.8';
  try {
    version = execFileSync(exe, ['--version'], {
      encoding: 'utf-8',
      timeout: 4000,
    }).trim();
  } catch {
    // fallback version
  }

  return {
    available: true,
    executablePath: exe,
    version,
    supportedModels: AGY_SUPPORTED_MODELS,
  };
}

/**
 * Runs a single bounded prompt through the local Antigravity (`agy`) CLI using stream-json protocol
 */
export async function invokeAgyStreamJson(params: {
  prompt: string;
  modelId?: string;
  effort?: 'low' | 'medium' | 'high';
  timeoutMs?: number;
}): Promise<{
  status: 'SUCCESS' | 'ERROR';
  observedModel: string | null;
  observedEffort: string | null;
  sessionId: string | null;
  responseText: string;
  error?: string;
  durationMs: number;
}> {
  const startTime = Date.now();
  const exe = resolveAgyExecutable();
  if (!exe) {
    return {
      status: 'ERROR',
      observedModel: null,
      observedEffort: null,
      sessionId: null,
      responseText: '',
      error: 'Executável do Antigravity CLI (agy.exe) não encontrado.',
      durationMs: Date.now() - startTime,
    };
  }

  const modelEntry =
    AGY_SUPPORTED_MODELS.find((m) => m.id === params.modelId) || AGY_SUPPORTED_MODELS[0];
  const model = modelEntry.id;
  const effort = params.effort || modelEntry.effort;
  const timeoutMs = params.timeoutMs || 90000;

  const args = [
    '--input-format',
    'stream-json',
    '--output-format',
    'stream-json',
    '--model',
    model,
    '--effort',
    effort,
    '--disable-slash-commands',
    '--mode',
    'plan',
  ];

  return new Promise((resolve) => {
    const child = spawn(exe, args, {
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stdoutData = '';
    let timedOut = false;
    let resolved = false;
    let observedModel: string | null = null;
    let observedEffort: string | null = null;
    let sessionId: string | null = null;

    const finish = (payload: {
      status: 'SUCCESS' | 'ERROR';
      observedModel: string | null;
      observedEffort: string | null;
      sessionId: string | null;
      responseText: string;
      error?: string;
      durationMs: number;
    }) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      try {
        child.kill();
      } catch {
        // ignore
      }
      resolve(payload);
    };

    const timer = setTimeout(() => {
      timedOut = true;
      finish({
        status: 'ERROR',
        observedModel,
        observedEffort,
        sessionId,
        responseText: '',
        error: `Timeout (${timeoutMs / 1000}s) aguardando resposta do Antigravity CLI.`,
        durationMs: Date.now() - startTime,
      });
    }, timeoutMs);

    child.stdout.setEncoding('utf-8');
    child.stdout.on('data', (chunk: string) => {
      stdoutData += chunk;
      const lines = stdoutData.split(/\r?\n/);
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const ev = JSON.parse(line);
          if (ev.event === 'init' && ev.init) {
            observedModel = ev.init.model || observedModel;
            observedEffort = ev.init.reasoning_effort || ev.init.effort || observedEffort;
            sessionId = ev.init.conversation_id || sessionId;
          } else if (ev.event === 'result' && ev.result) {
            const responseText = ev.result.response || '';
            sessionId = ev.result.conversation_id || sessionId;
            const errorMsg = ev.result.error ? String(ev.result.error) : undefined;
            finish({
              status: errorMsg ? 'ERROR' : 'SUCCESS',
              observedModel,
              observedEffort,
              sessionId,
              responseText,
              error: errorMsg,
              durationMs: Date.now() - startTime,
            });
            return;
          }
        } catch {
          // wait for complete json line
        }
      }
    });

    child.on('error', (err) => {
      finish({
        status: 'ERROR',
        observedModel,
        observedEffort,
        sessionId,
        responseText: '',
        error: `Falha ao executar agy CLI: ${err.message}`,
        durationMs: Date.now() - startTime,
      });
    });

    child.on('close', (code) => {
      if (resolved || timedOut) return;
      finish({
        status: 'ERROR',
        observedModel,
        observedEffort,
        sessionId,
        responseText: '',
        error: `Antigravity CLI encerrou sem evento result (código ${code})`,
        durationMs: Date.now() - startTime,
      });
    });

    const inputPayload =
      JSON.stringify({
        event: 'user',
        message: {
          content: params.prompt,
        },
      }) + '\n';

    child.stdin.write(inputPayload, 'utf-8');
    child.stdin.end();
  });
}

/**
 * Extracts a JSON object or array from an LLM response that might contain markdown fences
 */
export function extractJsonFromText<T>(text: string): T | null {
  if (!text) return null;
  const trimmed = text.trim();

  // Try direct JSON parse
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    // Try extracting from ```json ... ```
    const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenceMatch) {
      try {
        return JSON.parse(fenceMatch[1].trim()) as T;
      } catch {
        // continue
      }
    }

    // Try finding first { or [ and last } or ]
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1)) as T;
      } catch {
        // ignore
      }
    }
  }
  return null;
}

/**
 * Uses the local Antigravity/Gemini CLI (`agy`) to classify and group transactions intelligently
 */
export async function classifyTransactionsWithAgyCli(params: {
  transactions: UnifiedTransaction[];
  existingRules: GroupingRule[];
  learnedPatterns: LearnedPatternEntry[];
  modelId?: string;
  scope?: 'unmatched_only' | 'all_merchants';
}): Promise<AgyAiBatchResult> {
  const { transactions, modelId, scope = 'unmatched_only' } = params;

  // Build deduplicated merchant samples to send to Gemini CLI
  const candidatesMap = new Map<
    string,
    {
      extractedCounterparty: string;
      rawSample: string;
      source: string;
      documentId: string | null;
      currentGroup: string;
      currentCategory: string;
      count: number;
      totalAmount: number;
    }
  >();

  for (const tx of transactions) {
    if (tx.flowKind === 'cc_payment' || tx.flowKind === 'internal_transfer') continue;
    if (scope === 'unmatched_only' && tx.matchedRuleId !== null) continue;

    const key = tx.documentId || tx.extractedCounterparty.toUpperCase();
    if (!candidatesMap.has(key)) {
      candidatesMap.set(key, {
        extractedCounterparty: tx.extractedCounterparty,
        rawSample: tx.rawDescription.slice(0, 120),
        source: tx.source,
        documentId: tx.documentId,
        currentGroup: tx.merchantGroup,
        currentCategory: tx.category,
        count: 0,
        totalAmount: 0,
      });
    }
    const c = candidatesMap.get(key)!;
    c.count += 1;
    c.totalAmount += Math.abs(tx.rawAmount);
  }

  // If all transactions already matched rules in 'unmatched_only', sample top 25 groups for review/refinement
  if (candidatesMap.size === 0) {
    for (const tx of transactions) {
      if (tx.flowKind === 'cc_payment' || tx.flowKind === 'internal_transfer') continue;
      const key = tx.extractedCounterparty.toUpperCase();
      if (!candidatesMap.has(key)) {
        candidatesMap.set(key, {
          extractedCounterparty: tx.extractedCounterparty,
          rawSample: tx.rawDescription.slice(0, 120),
          source: tx.source,
          documentId: tx.documentId,
          currentGroup: tx.merchantGroup,
          currentCategory: tx.category,
          count: 0,
          totalAmount: 0,
        });
      }
      const c = candidatesMap.get(key)!;
      c.count += 1;
      c.totalAmount += Math.abs(tx.rawAmount);
    }
  }

  const batchList = Array.from(candidatesMap.values())
    .sort((a, b) => b.totalAmount - a.totalAmount)
    .slice(0, 35);

  const allowedCategories = DEFAULT_CATEGORIES.join(' | ');

  const prompt = [
    'INSTRUÇÃO ESTRITA: NÃO execute nenhuma ferramenta (não chame run_command, read_file, etc.). Responda IMEDIATAMENTE apenas com um objeto JSON válido.',
    'Você é um especialista em inteligência financeira pessoal no Brasil (extratos e faturas Nubank em Belo Horizonte/MG).',
    'Analise a lista de estabelecimentos/transações abaixo e retorne o agrupamento canônico ideal (suggestedMerchantGroup), a categoria exata (suggestedCategory), os padrões de texto (patterns) e uma breve explicação (reasoning).',
    '',
    `CATEGORIAS PERMITIDAS: ${allowedCategories}`,
    '',
    'DADOS PARA CLASSIFICAR E AGRUPAR:',
    JSON.stringify(batchList, null, 2),
    '',
    'Retorne ESTRITAMENTE um JSON válido no seguinte formato (sem blocos markdown adicionais fora do JSON):',
    '{',
    '  "classifications": [',
    '    {',
    '      "rawSample": "string original",',
    '      "extractedCounterparty": "nome extraído",',
    '      "documentId": "CPF/CNPJ ou null",',
    '      "suggestedMerchantGroup": "Nome Limpo e Agrupado do Estabelecimento/Pessoa",',
    '      "suggestedCategory": "Uma das Categorias Permitidas",',
    '      "patterns": ["padrao1", "padrao2"],',
    '      "reasoning": "Breve motivo em português",',
    '      "confidence": 95',
    '    }',
    '  ],',
    '  "financialSummaryAdvice": "Um parágrafo em português com insights inteligentes sobre esses lançamentos e padrões identificados."',
    '}',
  ].join('\n');

  const res = await invokeAgyStreamJson({
    prompt,
    modelId: modelId || 'gemini-3.8-flash-low',
    timeoutMs: 90000,
  });

  if (res.status !== 'SUCCESS') {
    return {
      status: 'ERROR',
      observedModel: res.observedModel,
      observedEffort: res.observedEffort,
      sessionId: res.sessionId,
      classifications: [],
      error: res.error || 'Falha ao consultar Antigravity CLI',
      durationMs: res.durationMs,
    };
  }

  const parsed = extractJsonFromText<{
    classifications?: AgyAiClassificationItem[];
    financialSummaryAdvice?: string;
  }>(res.responseText);

  if (!parsed || !Array.isArray(parsed.classifications)) {
    return {
      status: 'SUCCESS',
      observedModel: res.observedModel,
      observedEffort: res.observedEffort,
      sessionId: res.sessionId,
      classifications: [],
      financialSummaryAdvice: res.responseText,
      rawResponse: res.responseText,
      durationMs: res.durationMs,
    };
  }

  return {
    status: 'SUCCESS',
    observedModel: res.observedModel,
    observedEffort: res.observedEffort,
    sessionId: res.sessionId,
    classifications: parsed.classifications,
    financialSummaryAdvice: parsed.financialSummaryAdvice,
    rawResponse: res.responseText,
    durationMs: res.durationMs,
  };
}

/**
 * Uses the local Antigravity/Gemini CLI (`agy`) to answer custom financial questions or generate an executive analysis
 */
export async function askAgyFinancialAdvisor(params: {
  question: string;
  transactions: UnifiedTransaction[];
  modelId?: string;
}): Promise<{
  status: 'SUCCESS' | 'ERROR';
  observedModel: string | null;
  answer: string;
  durationMs: number;
  error?: string;
}> {
  const { question, transactions, modelId } = params;

  // Summarize key financial aggregates so the prompt is compact and fast
  const byCategory = new Map<string, number>();
  const byMerchant = new Map<string, { total: number; count: number; category: string }>();
  const byMonth = new Map<string, { income: number; expense: number }>();

  for (const tx of transactions) {
    const m = tx.competenceMonth;
    const mPrev = byMonth.get(m) || { income: 0, expense: 0 };
    mPrev.income += tx.incomeAmount;
    mPrev.expense += tx.expenseAmount;
    byMonth.set(m, mPrev);

    if (tx.expenseAmount !== 0) {
      byCategory.set(tx.category, (byCategory.get(tx.category) || 0) + tx.expenseAmount);
      const gPrev = byMerchant.get(tx.merchantGroup) || {
        total: 0,
        count: 0,
        category: tx.category,
      };
      gPrev.total += tx.expenseAmount;
      if (tx.flowKind === 'expense') gPrev.count += 1;
      byMerchant.set(tx.merchantGroup, gPrev);
    }
  }

  const summaryContext = {
    totalTransactions: transactions.length,
    monthlySummary: Object.fromEntries(
      Array.from(byMonth.entries()).sort((a, b) => a[0].localeCompare(b[0]))
    ),
    categoryTotals: Object.fromEntries(
      Array.from(byCategory.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => [k, Math.round(v * 100) / 100])
    ),
    top25Merchants: Array.from(byMerchant.entries())
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 25)
      .map(([name, info]) => ({
        merchant: name,
        category: info.category,
        count: info.count,
        totalBRL: Math.round(info.total * 100) / 100,
      })),
  };

  const prompt = [
    'INSTRUÇÃO ESTRITA: NÃO execute nenhuma ferramenta (não chame read_file, run_command, etc.). Responda diretamente usando apenas o resumo financeiro fornecido abaixo.',
    'Você é o Consultor Financeiro Pessoal IA integrado ao sistema Nubank Analytics.',
    '',
    'RESUMO DOS DADOS REAIS DO USUÁRIO (EM R$ BRL):',
    JSON.stringify(summaryContext, null, 2),
    '',
    `SOLICITAÇÃO DO USUÁRIO: ${question}`,
    '',
    'Responda em português de forma clara, estruturada com tópicos, citando valores reais e estabelecimentos dos dados acima.',
  ].join('\n');

  const res = await invokeAgyStreamJson({
    prompt,
    modelId: modelId || 'gemini-3.8-flash-low',
    timeoutMs: 90000,
  });

  return {
    status: res.status,
    observedModel: res.observedModel,
    answer: res.responseText,
    durationMs: res.durationMs,
    error: res.error,
  };
}
