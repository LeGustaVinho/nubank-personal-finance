import React, { useMemo, useState } from 'react';
import {
  CalendarCheck,
  AlertTriangle,
  CheckCircle2,
  Clock,
  UploadCloud,
  Landmark,
  CreditCard,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { CsvFileSummary, UnifiedTransaction } from '../../server/types';
import { formatBRL } from '../utils/formatters';

interface MissingStatementsTrackerProps {
  files: CsvFileSummary[];
  allTransactions: UnifiedTransaction[];
  onOpenUploadModal: () => void;
  defaultExpanded?: boolean;
}

const MONTH_NAMES_SHORT = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
];

const MONTH_NAMES_FULL = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

export interface MonthCoverageStatus {
  monthKey: string; // 'YYYY-MM'
  monthIndex: number; // 0..11
  shortLabel: string;
  fullLabel: string;
  hasBankStatement: boolean;
  bankFileNames: string[];
  bankTxCount: number;
  bankIncome: number;
  hasCreditCardInvoice: boolean;
  ccFileNames: string[];
  ccTxCount: number;
  ccExpenses: number;
  isFutureMonth: boolean;
  status: 'complete' | 'missing_bank' | 'missing_cc' | 'missing_both' | 'future';
}

export const MissingStatementsTracker: React.FC<MissingStatementsTrackerProps> = ({
  files,
  allTransactions,
  onOpenUploadModal,
  defaultExpanded = true,
}) => {
  // Determine available years from transactions and current year
  const availableYears = useMemo(() => {
    const years = new Set<string>(['2026']);
    for (const tx of allTransactions) {
      if (tx.competenceMonth?.length >= 4) {
        years.add(tx.competenceMonth.slice(0, 4));
      }
      if (tx.invoiceMonth?.length >= 4) {
        years.add(tx.invoiceMonth.slice(0, 4));
      }
    }
    return Array.from(years).sort((a, b) => b.localeCompare(a));
  }, [allTransactions]);

  const [selectedYear, setSelectedYear] = useState<string>(availableYears[0] || '2026');
  const [isExpanded, setIsExpanded] = useState<boolean>(defaultExpanded);

  // Current reference YYYY-MM (using system date or latest active month in dataset)
  const currentYearMonth = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }, []);

  const coverageByMonth = useMemo<MonthCoverageStatus[]>(() => {
    const result: MonthCoverageStatus[] = [];

    for (let mIdx = 0; mIdx < 12; mIdx++) {
      const mm = String(mIdx + 1).padStart(2, '0');
      const monthKey = `${selectedYear}-${mm}`;

      // Check bankAccount transactions and files in this month
      const bankTxs = allTransactions.filter(
        (tx) => tx.source === 'bankAccount' && tx.competenceMonth === monthKey
      );
      const bankFilesForMonth = files.filter(
        (f) =>
          f.source === 'bankAccount' &&
          (f.minDate.startsWith(monthKey) || f.maxDate.startsWith(monthKey))
      );

      // Check creditCard transactions (by invoiceMonth or competenceMonth) and files
      const ccInvoiceTxs = allTransactions.filter(
        (tx) => tx.source === 'creditCard' && tx.invoiceMonth === monthKey
      );
      const ccFilesForMonth = files.filter(
        (f) => f.source === 'creditCard' && f.fileName.includes(monthKey)
      );

      const hasBankStatement = bankTxs.length > 0 || bankFilesForMonth.length > 0;
      const hasCreditCardInvoice =
        ccInvoiceTxs.length > 0 || ccFilesForMonth.length > 0;

      const bankIncome = bankTxs
        .filter((t) => t.flowKind === 'income')
        .reduce((acc, t) => acc + t.incomeAmount, 0);

      const ccExpenses = ccInvoiceTxs
        .filter((t) => t.flowKind === 'expense' || t.flowKind === 'iof')
        .reduce((acc, t) => acc + Math.abs(t.rawAmount), 0);

      const isFutureMonth =
        monthKey > currentYearMonth && !hasBankStatement && !hasCreditCardInvoice;

      let status: MonthCoverageStatus['status'] = 'complete';
      if (isFutureMonth) {
        status = 'future';
      } else if (hasBankStatement && hasCreditCardInvoice) {
        status = 'complete';
      } else if (!hasBankStatement && hasCreditCardInvoice) {
        status = 'missing_bank';
      } else if (hasBankStatement && !hasCreditCardInvoice) {
        status = 'missing_cc';
      } else {
        status = 'missing_both';
      }

      result.push({
        monthKey,
        monthIndex: mIdx,
        shortLabel: MONTH_NAMES_SHORT[mIdx],
        fullLabel: `${MONTH_NAMES_FULL[mIdx]} de ${selectedYear}`,
        hasBankStatement,
        bankFileNames: Array.from(
          new Set([
            ...bankFilesForMonth.map((f) => f.fileName),
            ...bankTxs.map((t) => t.sourceFile),
          ])
        ),
        bankTxCount: bankTxs.length,
        bankIncome,
        hasCreditCardInvoice,
        ccFileNames: Array.from(
          new Set([
            ...ccFilesForMonth.map((f) => f.fileName),
            ...ccInvoiceTxs.map((t) => t.sourceFile),
          ])
        ),
        ccTxCount: ccInvoiceTxs.length,
        ccExpenses,
        isFutureMonth,
        status,
      });
    }

    return result;
  }, [selectedYear, allTransactions, files, currentYearMonth]);

  const summary = useMemo(() => {
    const completeMonths = coverageByMonth.filter((m) => m.status === 'complete');
    const missingBankMonths = coverageByMonth.filter(
      (m) => m.status === 'missing_bank' || m.status === 'missing_both'
    );
    const missingCcMonths = coverageByMonth.filter(
      (m) => m.status === 'missing_cc' || m.status === 'missing_both'
    );
    const pendingMonths = coverageByMonth.filter(
      (m) =>
        m.status === 'missing_bank' ||
        m.status === 'missing_cc' ||
        m.status === 'missing_both'
    );

    return {
      completeCount: completeMonths.length,
      missingBankMonths,
      missingCcMonths,
      pendingMonths,
    };
  }, [coverageByMonth]);

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-lg">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={`p-2 rounded-xl ${
              summary.pendingMonths.length > 0
                ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
            }`}
          >
            {summary.pendingMonths.length > 0 ? (
              <AlertTriangle className="w-5 h-5" />
            ) : (
              <CalendarCheck className="w-5 h-5" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-white">
                Mapa de Extratos e Faturas do Ano ({selectedYear})
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                {summary.completeCount} meses completos
              </span>
              {summary.pendingMonths.length > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  {summary.pendingMonths.length}{' '}
                  {summary.pendingMonths.length === 1
                    ? 'mês com CSV faltando'
                    : 'meses com CSV faltando'}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {summary.pendingMonths.length > 0 ? (
                <>
                  Faltam arquivos em:{' '}
                  <strong className="text-amber-300">
                    {summary.pendingMonths
                      .map((m) => {
                        if (m.status === 'missing_bank')
                          return `${m.shortLabel}/${selectedYear.slice(2)} (Falta Extrato da Conta)`;
                        if (m.status === 'missing_cc')
                          return `${m.shortLabel}/${selectedYear.slice(2)} (Falta Fatura do Cartão)`;
                        return `${m.shortLabel}/${selectedYear.slice(2)} (Faltam Conta e Cartão)`;
                      })
                      .join(' • ')}
                  </strong>
                </>
              ) : (
                'Todos os extratos da conta corrente e faturas do cartão até o momento foram enviados!'
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {availableYears.length > 1 && (
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="px-2.5 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-semibold text-white cursor-pointer"
            >
              {availableYears.map((y) => (
                <option key={y} value={y}>
                  Ano {y}
                </option>
              ))}
            </select>
          )}

          {summary.pendingMonths.length > 0 && (
            <button
              onClick={onOpenUploadModal}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 text-xs font-semibold transition cursor-pointer"
            >
              <UploadCloud className="w-3.5 h-3.5" />
              <span>Enviar CSVs Faltantes</span>
            </button>
          )}

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="px-2.5 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 text-xs flex items-center gap-1 cursor-pointer"
          >
            <span>{isExpanded ? 'Ocultar grade' : 'Ver 12 meses'}</span>
            {isExpanded ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* 12-Month Visual Grid */}
      {isExpanded && (
        <div className="mt-4 pt-3 border-t border-slate-800/80 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-12 gap-2">
          {coverageByMonth.map((m) => {
            const isComplete = m.status === 'complete';
            const isFuture = m.status === 'future';
            const isMissingSomething =
              m.status === 'missing_bank' ||
              m.status === 'missing_cc' ||
              m.status === 'missing_both';

            return (
              <div
                key={m.monthKey}
                onClick={() => {
                  if (isMissingSomething) onOpenUploadModal();
                }}
                title={
                  isMissingSomething
                    ? `Clique para enviar o CSV faltante de ${m.fullLabel}`
                    : m.fullLabel
                }
                className={`p-2.5 rounded-xl border transition flex flex-col justify-between ${
                  isComplete
                    ? 'bg-emerald-950/20 border-emerald-500/30'
                    : isMissingSomething
                    ? 'bg-amber-950/25 border-amber-500/50 hover:bg-amber-900/30 cursor-pointer'
                    : 'bg-slate-950/40 border-slate-800/60 opacity-60'
                }`}
              >
                {/* Month Header */}
                <div className="flex items-center justify-between gap-1 mb-2">
                  <span className="text-xs font-bold text-white">
                    {m.shortLabel}/{selectedYear.slice(2)}
                  </span>
                  {isComplete && (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  )}
                  {isMissingSomething && (
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  )}
                  {isFuture && <Clock className="w-3.5 h-3.5 text-slate-500 shrink-0" />}
                </div>

                {/* Status Rows: Conta & Cartão */}
                <div className="space-y-1 text-[10px]">
                  {/* Bank Account Status */}
                  <div
                    className={`flex items-center justify-between px-1.5 py-1 rounded ${
                      m.hasBankStatement
                        ? 'bg-emerald-500/15 text-emerald-300'
                        : isFuture
                        ? 'bg-slate-900 text-slate-500'
                        : 'bg-rose-500/20 text-rose-300 font-semibold'
                    }`}
                  >
                    <span className="flex items-center gap-1 truncate">
                      <Landmark className="w-2.5 h-2.5 shrink-0" />
                      <span>Conta</span>
                    </span>
                    <span>
                      {m.hasBankStatement
                        ? 'OK'
                        : isFuture
                        ? '—'
                        : 'FALTA'}
                    </span>
                  </div>

                  {/* Credit Card Status */}
                  <div
                    className={`flex items-center justify-between px-1.5 py-1 rounded ${
                      m.hasCreditCardInvoice
                        ? 'bg-violet-500/20 text-violet-300'
                        : isFuture
                        ? 'bg-slate-900 text-slate-500'
                        : 'bg-rose-500/20 text-rose-300 font-semibold'
                    }`}
                  >
                    <span className="flex items-center gap-1 truncate">
                      <CreditCard className="w-2.5 h-2.5 shrink-0" />
                      <span>Cartão</span>
                    </span>
                    <span>
                      {m.hasCreditCardInvoice
                        ? 'OK'
                        : isFuture
                        ? '—'
                        : 'FALTA'}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
