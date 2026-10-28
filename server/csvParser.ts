import fs from 'node:fs';
import path from 'node:path';
import {
  SourceType,
  UnifiedTransaction,
  GroupingRule,
  TransactionOverride,
  FlowKind,
  InstallmentInfo,
  CsvFileSummary,
  LearnedPatternEntry,
} from './types.ts';
import {
  matchGroupingRule,
  extractDocumentId,
} from './groupingEngine.ts';
import { applyCrossTransactionEntityResolution } from './intelligenceEngine.ts';

/**
 * RFC-4180 compliant CSV line parser (handles quoted fields and escaped "" quotes)
 */
export function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i += 2;
          continue;
        } else {
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        current += ch;
        i++;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
      } else if (ch === ',') {
        result.push(current);
        current = '';
        i++;
      } else {
        current += ch;
        i++;
      }
    }
  }
  result.push(current);
  return result;
}

export function parseCsvContent(content: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = content
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    if (values.length === 0 || (values.length === 1 && !values[0])) continue;
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] !== undefined ? values[idx].trim() : '';
    });
    rows.push(row);
  }

  return { headers, rows };
}

export function detectCsvSourceType(headers: string[]): SourceType | null {
  const norm = headers.map((h) => h.toLowerCase());
  if (norm.includes('identificador') && norm.includes('valor') && norm.includes('data')) {
    return 'bankAccount';
  }
  if (norm.includes('date') && norm.includes('title') && norm.includes('amount')) {
    return 'creditCard';
  }
  return null;
}

export function parseBrCurrency(valStr: string): number {
  if (!valStr) return 0;
  const cleaned = valStr
    .replace(/\s+/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  const num = Number.parseFloat(cleaned);
  return Number.isNaN(num) ? 0 : Math.round(num * 100) / 100;
}

export function convertDdMmYyyyToIso(dateStr: string): string {
  const parts = dateStr.trim().split('/');
  if (parts.length !== 3) return dateStr;
  const [dd, mm, yyyy] = parts;
  return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
}

export function extractInvoiceDateFromFilename(fileName: string): string | null {
  const match = fileName.match(/(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

export function parseBankAccountRow(
  row: Record<string, string>,
  fileName: string,
  rules: GroupingRule[],
  overrides: Record<string, TransactionOverride>,
  learnedPatterns: LearnedPatternEntry[] = []
): UnifiedTransaction | null {
  const rawDate = row['Data'] || '';
  const rawVal = row['Valor'] || '0';
  const rawId = (row['Identificador'] || '').trim();
  const rawDescription = (row['Descrição'] || row['Descricao'] || '').trim();

  if (!rawDate || !rawId) return null;

  const date = convertDdMmYyyyToIso(rawDate);
  const competenceMonth = date.slice(0, 7);
  const rawAmount = Math.round(Number.parseFloat(rawVal) * 100) / 100;
  const id = `${rawId}_${rawAmount >= 0 ? 'in' : 'out'}_${Math.abs(rawAmount).toFixed(2)}`;

  const parts = rawDescription.split(' - ').map((p) => p.trim());
  const prefix = parts[0] || 'Movimentação em Conta';

  let operationType = prefix;
  let extractedCounterparty = parts[1] || prefix;
  let subDetail: string | null = parts.length > 2 ? parts.slice(2).join(' • ') : null;

  if (prefix.toLowerCase() === 'estorno' && parts.length >= 3) {
    operationType = `Estorno (${parts[1]})`;
    extractedCounterparty = parts[2];
    subDetail = parts.slice(1).join(' • ');
  } else if (prefix.toLowerCase().startsWith('compra no débito')) {
    operationType = prefix;
    extractedCounterparty = parts[1] || prefix;
  } else if (prefix.toLowerCase().startsWith('transferência enviada pelo pix')) {
    operationType = 'Pix Enviado';
    // Handle case where name has "(Transferência enviada)" suffix without " - "
    extractedCounterparty = extractedCounterparty.replace(/\(Transferência enviada\)/i, '').trim();
  } else if (
    prefix.toLowerCase().startsWith('transferência recebida pelo pix') ||
    prefix.toLowerCase().startsWith('transferência recebida')
  ) {
    operationType = 'Pix / TED Recebido';
  } else if (prefix.toLowerCase().startsWith('pagamento de boleto')) {
    operationType = 'Pagamento de Boleto';
  } else if (prefix.toLowerCase().startsWith('reembolso recebido pelo pix')) {
    operationType = 'Reembolso Pix';
  }

  const documentId = extractDocumentId(rawDescription);

  const match = matchGroupingRule(
    rawDescription,
    extractedCounterparty,
    rules,
    overrides,
    id,
    documentId,
    learnedPatterns,
    'bankAccount'
  );

  const override = overrides[id];

  // Determine FlowKind
  let flowKind: FlowKind = 'expense';
  if (override?.flowKind) {
    flowKind = override.flowKind;
  } else if (match.forcedFlowKind) {
    flowKind = match.forcedFlowKind;
  } else if (prefix.toLowerCase() === 'pagamento de fatura') {
    flowKind = 'cc_payment';
  } else if (
    prefix.toLowerCase().includes('aplicação rdb') ||
    prefix.toLowerCase().includes('aplicação cdb') ||
    prefix.toLowerCase().includes('resgate rdb')
  ) {
    flowKind = 'investment';
  } else if (prefix.toLowerCase().includes('valor adicionado na conta por cartão')) {
    flowKind = 'internal_transfer';
  } else if (
    prefix.toLowerCase().startsWith('estorno') ||
    prefix.toLowerCase().startsWith('reembolso')
  ) {
    flowKind = 'refund';
  } else if (rawAmount > 0) {
    flowKind = 'income';
  } else {
    flowKind = 'expense';
  }

  const signedCashflow = rawAmount;
  let expenseAmount = 0;
  let incomeAmount = 0;

  if (flowKind === 'expense' || flowKind === 'iof') {
    expenseAmount = Math.abs(rawAmount);
  } else if (flowKind === 'refund') {
    expenseAmount = -Math.abs(rawAmount);
  } else if (flowKind === 'income') {
    incomeAmount = Math.abs(rawAmount);
  }

  return {
    id,
    source: 'bankAccount',
    sourceFile: fileName,
    date,
    competenceMonth,
    invoiceDate: null,
    invoiceMonth: competenceMonth,
    rawDescription,
    operationType,
    extractedCounterparty,
    documentId,
    gateway: match.gateway,
    subDetail: match.subDetail || subDetail,
    merchantGroup: match.merchantGroup,
    category:
      flowKind === 'income' && match.matchedRuleId === null
        ? 'Receitas & Câmbio PJ'
        : match.category,
    flowKind,
    classificationSource: match.classificationSource,
    confidence: match.confidence,
    rawAmount,
    signedCashflow,
    expenseAmount,
    incomeAmount,
    installment: null,
    linkedTargetTitle: null,
    matchedRuleId: match.matchedRuleId,
    tags: override?.tags,
    notes: override?.notes,
  };
}

export function parseCreditCardRow(
  row: Record<string, string>,
  fileName: string,
  occurrenceIndex: number,
  rules: GroupingRule[],
  overrides: Record<string, TransactionOverride>,
  learnedPatterns: LearnedPatternEntry[] = []
): UnifiedTransaction | null {
  const date = (row['date'] || '').trim();
  const rawDescription = (row['title'] || '').trim();
  const amountStr = (row['amount'] || '').trim();

  if (!date || !rawDescription) return null;

  const rawAmount = parseBrCurrency(amountStr);
  const competenceMonth = date.slice(0, 7);
  const invoiceDate = extractInvoiceDateFromFilename(fileName);
  const invoiceMonth = invoiceDate ? invoiceDate.slice(0, 7) : competenceMonth;

  const id = `cc_${invoiceDate || competenceMonth}_${date}_${rawDescription
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase()}_${rawAmount.toFixed(2)}_${occurrenceIndex}`;

  let operationType = 'Compra no Crédito';
  let extractedCounterparty = rawDescription;
  let linkedTargetTitle: string | null = null;
  let installment: InstallmentInfo | null = null;

  const iofMatch = rawDescription.match(/^IOF de "(.+)"$/i);
  if (iofMatch) {
    operationType = 'IOF Internacional';
    linkedTargetTitle = iofMatch[1].trim();
    extractedCounterparty = linkedTargetTitle;
  }

  const estornoMatch = rawDescription.match(/^Estorno de "(.+)"$/i);
  const antMatch = rawDescription.match(/^Desconto Antecipação (.+)$/i);
  if (estornoMatch) {
    operationType = 'Estorno no Cartão';
    linkedTargetTitle = estornoMatch[1].trim();
    extractedCounterparty = linkedTargetTitle;
  } else if (antMatch) {
    operationType = 'Desconto de Antecipação';
    linkedTargetTitle = antMatch[1].trim();
    extractedCounterparty = linkedTargetTitle;
  }

  const parcelaMatch = rawDescription.match(/^(.+?)\s*-\s*Parcela\s+(\d+)\/(\d+)$/i);
  if (parcelaMatch) {
    const baseMerchantTitle = parcelaMatch[1].trim();
    const current = Number.parseInt(parcelaMatch[2], 10);
    const total = Number.parseInt(parcelaMatch[3], 10);
    installment = { current, total, baseMerchantTitle };
    operationType = `Parcelado (${current}/${total})`;
    extractedCounterparty = baseMerchantTitle;
  }

  const targetForGrouping = linkedTargetTitle || extractedCounterparty;
  const match = matchGroupingRule(
    targetForGrouping,
    extractedCounterparty,
    rules,
    overrides,
    id,
    null,
    learnedPatterns,
    'creditCard'
  );

  const override = overrides[id];

  let flowKind: FlowKind = 'expense';
  if (override?.flowKind) {
    flowKind = override.flowKind;
  } else if (match.forcedFlowKind) {
    flowKind = match.forcedFlowKind;
  } else if (rawDescription.toLowerCase() === 'pagamento recebido') {
    flowKind = 'cc_payment';
    operationType = 'Pagamento de Fatura';
  } else if (iofMatch) {
    flowKind = 'iof';
  } else if (estornoMatch || antMatch || rawAmount < 0) {
    flowKind = 'refund';
    if (!estornoMatch && !antMatch) {
      operationType = 'Crédito / Estorno no Cartão';
    }
  } else {
    flowKind = 'expense';
  }

  const signedCashflow = -rawAmount;
  let expenseAmount = 0;
  const incomeAmount = 0;

  if (flowKind === 'expense' || flowKind === 'iof') {
    expenseAmount = Math.abs(rawAmount);
  } else if (flowKind === 'refund') {
    expenseAmount = -Math.abs(rawAmount);
  }

  return {
    id,
    source: 'creditCard',
    sourceFile: fileName,
    date,
    competenceMonth,
    invoiceDate,
    invoiceMonth,
    rawDescription,
    operationType,
    extractedCounterparty,
    documentId: null,
    gateway: match.gateway,
    subDetail: iofMatch
      ? `IOF referente a "${linkedTargetTitle}"`
      : estornoMatch
      ? `Estorno referente a "${linkedTargetTitle}"`
      : match.subDetail,
    merchantGroup: match.merchantGroup,
    category: match.category,
    flowKind,
    classificationSource: match.classificationSource,
    confidence: match.confidence,
    rawAmount,
    signedCashflow,
    expenseAmount,
    incomeAmount,
    installment,
    linkedTargetTitle,
    matchedRuleId: match.matchedRuleId,
    tags: override?.tags,
    notes: override?.notes,
  };
}

export function loadAllTransactionsFromDisk(
  rootDir: string,
  rules: GroupingRule[],
  overrides: Record<string, TransactionOverride>,
  learnedPatterns: LearnedPatternEntry[] = []
): {
  transactions: UnifiedTransaction[];
  files: CsvFileSummary[];
} {
  const bankDir = path.join(rootDir, 'bankAccount');
  const ccDir = path.join(rootDir, 'creditCard');

  const transactionMap = new Map<string, UnifiedTransaction>();
  const files: CsvFileSummary[] = [];

  if (fs.existsSync(bankDir)) {
    const bankFiles = fs
      .readdirSync(bankDir)
      .filter((f) => f.toLowerCase().endsWith('.csv'))
      .sort();

    for (const fileName of bankFiles) {
      const fullPath = path.join(bankDir, fileName);
      const content = fs.readFileSync(fullPath, 'utf-8');
      const { rows } = parseCsvContent(content);

      let minDate = '9999-99-99';
      let maxDate = '0000-00-00';
      let totalExpenses = 0;
      let totalIncome = 0;
      let validCount = 0;

      for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
        const row = rows[rowIdx];
        const tx = parseBankAccountRow(row, fileName, rules, overrides, learnedPatterns);
        if (!tx) continue;
        tx.csvRowOrder = rowIdx;
        validCount++;
        if (tx.date < minDate) minDate = tx.date;
        if (tx.date > maxDate) maxDate = tx.date;
        if (tx.expenseAmount > 0) totalExpenses += tx.expenseAmount;
        if (tx.incomeAmount > 0) totalIncome += tx.incomeAmount;

        transactionMap.set(tx.id, tx);
      }

      files.push({
        fileName,
        source: 'bankAccount',
        rowCount: validCount,
        minDate: validCount > 0 ? minDate : '-',
        maxDate: validCount > 0 ? maxDate : '-',
        totalExpenses: Math.round(totalExpenses * 100) / 100,
        totalIncome: Math.round(totalIncome * 100) / 100,
        invoiceDate: null,
      });
    }
  }

  if (fs.existsSync(ccDir)) {
    const ccFiles = fs
      .readdirSync(ccDir)
      .filter((f) => f.toLowerCase().endsWith('.csv'))
      .sort();

    for (const fileName of ccFiles) {
      const fullPath = path.join(ccDir, fileName);
      const content = fs.readFileSync(fullPath, 'utf-8');
      const { rows } = parseCsvContent(content);

      let minDate = '9999-99-99';
      let maxDate = '0000-00-00';
      let totalExpenses = 0;
      const totalIncome = 0;
      let validCount = 0;

      const occurrenceCounter = new Map<string, number>();

      for (const row of rows) {
        const sig = `${row['date']}|${row['title']}|${row['amount']}`;
        const occ = (occurrenceCounter.get(sig) || 0) + 1;
        occurrenceCounter.set(sig, occ);

        const tx = parseCreditCardRow(row, fileName, occ, rules, overrides, learnedPatterns);
        if (!tx) continue;
        validCount++;
        if (tx.date < minDate) minDate = tx.date;
        if (tx.date > maxDate) maxDate = tx.date;
        if (tx.expenseAmount !== 0) totalExpenses += tx.expenseAmount;

        transactionMap.set(tx.id, tx);
      }

      files.push({
        fileName,
        source: 'creditCard',
        rowCount: validCount,
        minDate: validCount > 0 ? minDate : '-',
        maxDate: validCount > 0 ? maxDate : '-',
        totalExpenses: Math.round(totalExpenses * 100) / 100,
        totalIncome: Math.round(totalIncome * 100) / 100,
        invoiceDate: extractInvoiceDateFromFilename(fileName),
      });
    }
  }

  const rawList = Array.from(transactionMap.values()).sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    if (
      a.source === 'bankAccount' &&
      b.source === 'bankAccount' &&
      typeof a.csvRowOrder === 'number' &&
      typeof b.csvRowOrder === 'number' &&
      a.csvRowOrder !== b.csvRowOrder
    ) {
      return b.csvRowOrder - a.csvRowOrder;
    }
    return b.id.localeCompare(a.id);
  });

  // Cross-transaction entity resolution (unifies counterparties sharing the same CPF/CNPJ)
  const transactions = applyCrossTransactionEntityResolution(rawList);

  return { transactions, files };
}
