import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import {
  loadAllTransactionsFromDisk,
  parseCsvContent,
  detectCsvSourceType,
  extractInvoiceDateFromFilename,
  convertDdMmYyyyToIso,
} from './csvParser.ts';
import {
  loadUserConfig,
  saveUserConfig,
  upsertRule,
  deleteRule,
  setTransactionOverride,
  setMerchantCostTypeOverride,
  setCurrentBankBalance,
  setCsvPartialFlag,
  learnPatternFromUser,
  deleteLearnedPattern,
  dismissSuggestion,
} from './configStore.ts';
import { DEFAULT_CATEGORIES, DEFAULT_GROUPING_RULES } from './groupingEngine.ts';
import {
  generateSmartSuggestions,
  generateBehavioralInsights,
} from './intelligenceEngine.ts';
import {
  getAgyCliStatus,
  classifyTransactionsWithAgyCli,
  askAgyFinancialAdvisor,
} from './agyCliBridge.ts';
import { GroupingRule, SourceType } from './types.ts';

const app = express();
const PORT = Number(process.env.API_PORT || process.env.PORT || 3001);
const ROOT_DIR = process.cwd();

app.use(cors());
app.use(express.json({ limit: '25mb' }));

app.get('/api/health', (_req, res) => {
  res.json({
    app: 'financas-nubank-analytics',
    status: 'ok',
    apiPort: PORT,
    pid: process.pid,
  });
});

function getFullState() {
  const config = loadUserConfig();
  const partialSet = new Set<string>(config.partialCsvFiles || []);
  const { transactions, files: rawFiles } = loadAllTransactionsFromDisk(
    ROOT_DIR,
    config.rules,
    config.overrides,
    config.learnedPatterns
  );

  const files = rawFiles.map((f) => ({
    ...f,
    isPartial: partialSet.has(`${f.source}/${f.fileName}`) || partialSet.has(f.fileName),
  }));

  const categorySet = new Set<string>(DEFAULT_CATEGORIES);
  for (const r of config.rules) {
    if (r.category) categorySet.add(r.category);
  }
  for (const tx of transactions) {
    if (tx.category) categorySet.add(tx.category);
  }

  const smartSuggestions = generateSmartSuggestions(
    transactions,
    config.rules,
    config.learnedPatterns,
    config.dismissedSuggestions
  );
  const behavioralInsights = generateBehavioralInsights(transactions);
  const agyStatus = getAgyCliStatus();

  return {
    transactions,
    files,
    rules: config.rules,
    learnedPatterns: config.learnedPatterns,
    smartSuggestions,
    behavioralInsights,
    agyStatus,
    overrides: config.overrides,
    categoryBudgets: config.categoryBudgets,
    costTypeOverrides: config.costTypeOverrides || {},
    currentBankBalance:
      typeof config.currentBankBalance === 'number' ? config.currentBankBalance : null,
    categories: Array.from(categorySet),
  };
}

app.get('/api/data', (_req, res) => {
  try {
    res.json(getFullState());
  } catch (err: any) {
    console.error('Error loading data:', err);
    res.status(500).json({ error: err?.message || 'Erro ao carregar dados' });
  }
});

// POST /api/ai/classify - Connects to local Antigravity/Gemini CLI to classify and group transactions
app.post('/api/ai/classify', async (req, res) => {
  try {
    const {
      modelId = 'gemini-3.8-flash-low',
      scope = 'unmatched_only',
      autoApply = true,
    } = req.body || {};

    const currentState = getFullState();
    const aiResult = await classifyTransactionsWithAgyCli({
      transactions: currentState.transactions,
      existingRules: currentState.rules,
      learnedPatterns: currentState.learnedPatterns,
      modelId,
      scope,
    });

    if (aiResult.status === 'SUCCESS' && autoApply && aiResult.classifications.length > 0) {
      for (const item of aiResult.classifications) {
        if (!item.suggestedMerchantGroup || !item.suggestedCategory) continue;
        learnPatternFromUser({
          merchantGroup: item.suggestedMerchantGroup,
          category: item.suggestedCategory,
          rawCounterparty: item.extractedCounterparty || item.rawSample,
          documentId: item.documentId || null,
        });
      }
    }

    const updatedState = getFullState();
    res.json({
      aiResult,
      state: updatedState,
    });
  } catch (err: any) {
    console.error('AI Classify error:', err);
    res.status(500).json({ error: err?.message || 'Erro na classificação via Antigravity CLI' });
  }
});

// POST /api/ai/advisor - Uses local Antigravity/Gemini CLI to analyze finances or answer user questions
app.post('/api/ai/advisor', async (req, res) => {
  try {
    const {
      question = 'Faça um diagnóstico executivo completo das minhas finanças, apontando os maiores ralos de gastos, oportunidades de economia e análise das minhas assinaturas e entregas.',
      modelId = 'gemini-3.8-flash-low',
    } = req.body || {};

    const currentState = getFullState();
    const result = await askAgyFinancialAdvisor({
      question,
      transactions: currentState.transactions,
      modelId,
    });

    res.json(result);
  } catch (err: any) {
    console.error('AI Advisor error:', err);
    res.status(500).json({ error: err?.message || 'Erro ao consultar Antigravity CLI' });
  }
});

app.post('/api/upload', async (req, res) => {
  try {
    const { files, autoAiClassify = true, modelId = 'gemini-3.8-flash-low' } = req.body as {
      files: Array<{ fileName: string; content: string; forceSource?: SourceType }>;
      autoAiClassify?: boolean;
      modelId?: string;
    };

    if (!Array.isArray(files) || files.length === 0) {
      res.status(400).json({ error: 'Nenhum arquivo CSV enviado.' });
      return;
    }

    const beforeState = getFullState();
    const beforeIds = new Set(beforeState.transactions.map((t) => t.id));

    const results: Array<{
      fileName: string;
      detectedType: SourceType;
      savedPath: string;
      rowsInFile: number;
      status: 'saved' | 'error';
      message: string;
    }> = [];

    for (const item of files) {
      const safeName = path.basename(item.fileName).replace(/[^a-zA-Z0-9._-]/g, '_');
      const finalName = safeName.toLowerCase().endsWith('.csv') ? safeName : `${safeName}.csv`;

      const { headers, rows } = parseCsvContent(item.content || '');
      const detected = item.forceSource || detectCsvSourceType(headers);

      if (!detected) {
        results.push({
          fileName: item.fileName,
          detectedType: 'bankAccount',
          savedPath: '',
          rowsInFile: 0,
          status: 'error',
          message: `Cabeçalho CSV não reconhecido (${headers.join(', ')}).`,
        });
        continue;
      }

      const targetDir = path.join(ROOT_DIR, detected);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      let resolvedFinalName = finalName;
      let replacedPartialFiles: string[] = [];

      if (detected === 'creditCard') {
        const invDate = extractInvoiceDateFromFilename(item.fileName);
        if (invDate) {
          // Canonicalize filename so "Nubank_2026-11-20 (1).csv" updates "Nubank_2026-11-20.csv"
          resolvedFinalName = `Nubank_${invDate}.csv`;
          const existingCcFiles = fs
            .readdirSync(targetDir)
            .filter((f) => f.toLowerCase().endsWith('.csv'));
          for (const existingFile of existingCcFiles) {
            if (
              existingFile !== resolvedFinalName &&
              extractInvoiceDateFromFilename(existingFile) === invDate
            ) {
              fs.unlinkSync(path.join(targetDir, existingFile));
              replacedPartialFiles.push(existingFile);
            }
          }
        }
      } else if (detected === 'bankAccount') {
        // Check if the uploaded bank statement supersedes an older partial CSV of the same period
        const newIds = new Set(
          rows.map((r) => (r['Identificador'] || '').trim()).filter(Boolean)
        );
        const newMonths = new Set(
          rows
            .map((r) => convertDdMmYyyyToIso(r['Data'] || '').slice(0, 7))
            .filter((m) => /^\d{4}-\d{2}$/.test(m))
        );

        if (newIds.size > 0) {
          const existingBankFiles = fs
            .readdirSync(targetDir)
            .filter((f) => f.toLowerCase().endsWith('.csv'));

          for (const existingFile of existingBankFiles) {
            if (existingFile === resolvedFinalName) continue;
            try {
              const oldContent = fs.readFileSync(
                path.join(targetDir, existingFile),
                'utf-8'
              );
              const oldParsed = parseCsvContent(oldContent);
              const oldIds = oldParsed.rows
                .map((r) => (r['Identificador'] || '').trim())
                .filter(Boolean);
              const oldMonths = new Set(
                oldParsed.rows
                  .map((r) => convertDdMmYyyyToIso(r['Data'] || '').slice(0, 7))
                  .filter((m) => /^\d{4}-\d{2}$/.test(m))
              );

              const isSubsetByIds =
                oldIds.length > 0 && oldIds.every((id) => newIds.has(id));
              const isSameSingleMonthSupersede =
                newMonths.size === 1 &&
                oldMonths.size === 1 &&
                Array.from(newMonths)[0] === Array.from(oldMonths)[0] &&
                rows.length >= oldParsed.rows.length;

              if (isSubsetByIds || isSameSingleMonthSupersede) {
                fs.unlinkSync(path.join(targetDir, existingFile));
                replacedPartialFiles.push(existingFile);
              }
            } catch {
              // ignore read error on old file
            }
          }
        }
      }

      const targetPath = path.join(targetDir, resolvedFinalName);
      fs.writeFileSync(targetPath, item.content, 'utf-8');

      // Se um arquivo antigo estava marcado como parcial e foi substituído/atualizado, limpa a flag parcial automaticamente
      setCsvPartialFlag(`${detected}/${resolvedFinalName}`, false);
      for (const oldFile of replacedPartialFiles) {
        setCsvPartialFlag(`${detected}/${oldFile}`, false);
        setCsvPartialFlag(oldFile, false);
      }

      const replaceNote =
        replacedPartialFiles.length > 0
          ? ` • Substituiu parcial: ${replacedPartialFiles.join(', ')}`
          : '';

      results.push({
        fileName: resolvedFinalName,
        detectedType: detected,
        savedPath: `${detected}/${resolvedFinalName}`,
        rowsInFile: rows.length,
        status: 'saved',
        message: `Salvo em ${detected}/${resolvedFinalName} (${rows.length} linhas${replaceNote})`,
      });
    }

    let afterState = getFullState();
    const newTransactions = afterState.transactions.filter((tx) => !beforeIds.has(tx.id));
    const newUnmatched = newTransactions.filter((tx) => tx.matchedRuleId === null);

    let aiClassifiedCount = 0;
    if (autoAiClassify && newUnmatched.length > 0 && afterState.agyStatus.available) {
      const aiRes = await classifyTransactionsWithAgyCli({
        transactions: newUnmatched,
        existingRules: afterState.rules,
        learnedPatterns: afterState.learnedPatterns,
        modelId,
        scope: 'unmatched_only',
      });
      if (aiRes.status === 'SUCCESS' && aiRes.classifications.length > 0) {
        for (const item of aiRes.classifications) {
          if (!item.suggestedMerchantGroup || !item.suggestedCategory) continue;
          learnPatternFromUser({
            merchantGroup: item.suggestedMerchantGroup,
            category: item.suggestedCategory,
            rawCounterparty: item.extractedCounterparty || item.rawSample,
            documentId: item.documentId || null,
          });
          aiClassifiedCount++;
        }
        afterState = getFullState();
      }
    }

    res.json({
      results,
      newTransactionsCount: newTransactions.length,
      aiClassifiedCount,
      totalTransactions: afterState.transactions.length,
      state: afterState,
    });
  } catch (err: any) {
    console.error('Upload error:', err);
    res.status(500).json({ error: err?.message || 'Erro ao processar upload de CSV' });
  }
});

app.post('/api/rules', (req, res) => {
  try {
    const rule = req.body as GroupingRule;
    if (!rule.merchantGroup || !rule.category || !Array.isArray(rule.patterns)) {
      res.status(400).json({ error: 'Dados da regra inválidos.' });
      return;
    }
    const finalRule: GroupingRule = {
      id: rule.id || `custom-${Date.now()}`,
      merchantGroup: rule.merchantGroup.trim(),
      category: rule.category.trim(),
      patterns: rule.patterns.map((p) => p.trim()).filter(Boolean),
      documentIds: rule.documentIds,
      forceFlowKind: rule.forceFlowKind,
      isCustom: true,
    };
    upsertRule(finalRule);
    res.json(getFullState());
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Erro ao salvar regra' });
  }
});

app.delete('/api/rules/:id', (req, res) => {
  try {
    deleteRule(req.params.id);
    res.json(getFullState());
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Erro ao remover regra' });
  }
});

app.post('/api/learn', (req, res) => {
  try {
    const { merchantGroup, category, rawCounterparty, documentId, flowKind, suggestionId } =
      req.body;
    if (!merchantGroup || !category || !rawCounterparty) {
      res.status(400).json({ error: 'Parâmetros incompletos para aprendizado.' });
      return;
    }
    learnPatternFromUser({
      merchantGroup: merchantGroup.trim(),
      category: category.trim(),
      rawCounterparty: rawCounterparty.trim(),
      documentId,
      flowKind,
    });
    if (suggestionId) {
      dismissSuggestion(suggestionId);
    }
    res.json(getFullState());
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Erro ao registrar aprendizado' });
  }
});

app.delete('/api/learned/:id', (req, res) => {
  try {
    deleteLearnedPattern(req.params.id);
    res.json(getFullState());
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Erro ao remover padrão aprendido' });
  }
});

app.post('/api/suggestions/:id/dismiss', (req, res) => {
  try {
    dismissSuggestion(req.params.id);
    res.json(getFullState());
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Erro ao dispensar sugestão' });
  }
});

app.post('/api/rules/reset', (_req, res) => {
  try {
    const config = loadUserConfig();
    config.rules = DEFAULT_GROUPING_RULES;
    saveUserConfig(config);
    res.json(getFullState());
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Erro ao restaurar regras' });
  }
});

app.patch('/api/transactions/:id/override', (req, res) => {
  try {
    const txId = req.params.id;
    const override = req.body;
    setTransactionOverride(txId, override);
    res.json(getFullState());
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Erro ao atualizar transação' });
  }
});

app.put('/api/budgets', (req, res) => {
  try {
    const budgets = req.body as Record<string, number>;
    const config = loadUserConfig();
    config.categoryBudgets = budgets;
    saveUserConfig(config);
    res.json(getFullState());
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Erro ao salvar metas de orçamento' });
  }
});

app.put('/api/cost-types', (req, res) => {
  try {
    const { merchantGroup, costType } = req.body;
    if (!merchantGroup) {
      res.status(400).json({ error: 'merchantGroup obrigatório' });
      return;
    }
    setMerchantCostTypeOverride(merchantGroup, costType || null);
    res.json(getFullState());
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Erro ao atualizar tipo de custo' });
  }
});

app.put('/api/bank-balance', (req, res) => {
  try {
    const { currentBankBalance } = req.body || {};
    const parsed =
      currentBankBalance === null || currentBankBalance === undefined || currentBankBalance === ''
        ? null
        : Number(currentBankBalance);
    setCurrentBankBalance(parsed !== null && !Number.isNaN(parsed) ? parsed : null);
    res.json(getFullState());
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Erro ao atualizar saldo atual da conta' });
  }
});

app.put('/api/files/partial', (req, res) => {
  try {
    const { source, fileName, isPartial } = req.body || {};
    if (!source || !fileName) {
      res.status(400).json({ error: 'source e fileName são obrigatórios' });
      return;
    }
    setCsvPartialFlag(`${source}/${fileName}`, Boolean(isPartial));
    if (!isPartial) {
      setCsvPartialFlag(fileName, false);
    }
    res.json(getFullState());
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Erro ao atualizar marcação de CSV parcial' });
  }
});

// Serve production build static files if dist/ exists
const distPath = path.join(ROOT_DIR, 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
}

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`[Finanças API] Servidor rodando em http://localhost:${PORT}`);
  });
}

export default app;
