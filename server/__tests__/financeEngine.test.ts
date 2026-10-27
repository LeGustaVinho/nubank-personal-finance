import { describe, it, expect } from 'vitest';
import path from 'node:path';
import {
  parseBrCurrency,
  parseCsvLine,
  detectCsvSourceType,
  loadAllTransactionsFromDisk,
} from '../csvParser.ts';
import {
  DEFAULT_GROUPING_RULES,
  extractDocumentId,
  extractGatewayAndCleanName,
  inferSemanticCategory,
} from '../groupingEngine.ts';
import { generateBehavioralInsights } from '../intelligenceEngine.ts';
import { getAgyCliStatus, extractJsonFromText } from '../agyCliBridge.ts';

describe('Nubank CSV Parser, Grouping & Intelligence Engine', () => {
  it('detects the local Antigravity CLI (agy.exe) and extracts JSON from AI responses', () => {
    const status = getAgyCliStatus();
    expect(status.supportedModels.length).toBeGreaterThanOrEqual(4);
    const parsed = extractJsonFromText<{ ok: boolean }>('```json\n{"ok": true}\n```');
    expect(parsed?.ok).toBe(true);
  });
  it('accurately parses Brazilian currency formats including spaces and thousand separators', () => {
    expect(parseBrCurrency('21,24')).toBe(21.24);
    expect(parseBrCurrency('1.648,12')).toBe(1648.12);
    expect(parseBrCurrency('- 8,87')).toBe(-8.87);
    expect(parseBrCurrency('- 6.533,59')).toBe(-6533.59);
  });

  it('handles escaped double quotes in CSV lines (IOF & Estorno)', () => {
    const line = '2026-09-24,"IOF de ""Openai *Chatgpt Subscr""","17,87"';
    const fields = parseCsvLine(line);
    expect(fields).toEqual(['2026-09-24', 'IOF de "Openai *Chatgpt Subscr"', '17,87']);
  });

  it('extracts CPF/CNPJ documents and unpacks payment gateways', () => {
    expect(
      extractDocumentId(
        'Transferência enviada pelo Pix - CLARO - 40.432.544/0001-47 - ITAÚ'
      )
    ).toBe('40.432.544/0001-47');
    expect(
      extractDocumentId(
        'Transferência enviada pelo Pix - JOAO DA SILVA - •••.123.456-•• - ITAÚ'
      )
    ).toBe('•••.123.456-••');

    const gw = extractGatewayAndCleanName('Ifd*Saito Sushi Restau');
    expect(gw.gateway).toBe('iFood');
    expect(gw.cleanName).toBe('Saito Sushi Restau');

    const mp = extractGatewayAndCleanName('Mp *Calhasatual');
    expect(mp.gateway).toBe('Mercado Pago');
    expect(mp.cleanName).toBe('Calhasatual');
  });

  it('classifies brand-new unseen merchants via Semantic AI sector dictionary', () => {
    expect(inferSemanticCategory('Churrascaria Gaucha Grill', 'creditCard').category).toBe(
      'Restaurantes & Bares'
    );
    expect(inferSemanticCategory('Drogaria Pague Menos', 'creditCard').category).toBe(
      'Saúde & Farmácia'
    );
    expect(inferSemanticCategory('Posto Shell Pampulha', 'creditCard').category).toBe(
      'Transporte & Mobilidade'
    );
  });

  it('loads CSV files from disk (or gracefully returns empty state when folders are clean) and generates insights', () => {
    const rootDir = path.resolve(process.cwd());
    const { transactions, files } = loadAllTransactionsFromDisk(
      rootDir,
      DEFAULT_GROUPING_RULES,
      {}
    );

    if (files.length >= 20) {
      expect(transactions.length).toBe(966);

      // Verify Uber variations are unified under 'Uber'
      const uberTxs = transactions.filter((t) => t.merchantGroup === 'Uber');
      expect(uberTxs.length).toBe(136);

      // Verify iFood includes credit card iFood, Ifd* restaurants, NuPay debit, and Pix iFood
      const ifoodTxs = transactions.filter((t) => t.merchantGroup === 'iFood');
      expect(ifoodTxs.length).toBeGreaterThanOrEqual(130);

      // Verify IOF transactions are linked to the original merchant
      const iofTxs = transactions.filter((t) => t.flowKind === 'iof');
      expect(iofTxs.length).toBeGreaterThan(50);
      const openaiIof = iofTxs.find((t) => t.rawDescription.includes('Openai'));
      expect(openaiIof?.merchantGroup).toBe('OpenAI (ChatGPT Plus / API)');

      // Verify invoice payments have 0 expenseAmount
      const ccPayments = transactions.filter((t) => t.flowKind === 'cc_payment');
      expect(ccPayments.length).toBe(25);
      expect(ccPayments.every((t) => t.expenseAmount === 0 && t.incomeAmount === 0)).toBe(true);

      // Verify behavioral insights generation
      const insights = generateBehavioralInsights(transactions);
      expect(insights.length).toBeGreaterThanOrEqual(4);
    } else {
      expect(Array.isArray(transactions)).toBe(true);
    }
  });
});
