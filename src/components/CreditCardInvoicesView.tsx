import React, { useMemo, useState } from 'react';
import {
  CreditCard,
  Calendar,
  Receipt,
  CheckCircle2,
  ArrowDownLeft,
  Globe,
  Layers,
} from 'lucide-react';
import { CsvFileSummary, UnifiedTransaction } from '../../server/types';
import {
  formatBRL,
  formatDateBR,
  formatMonthFull,
  getCategoryColor,
} from '../utils/formatters';
import { MissingStatementsTracker } from './MissingStatementsTracker';

interface CreditCardInvoicesViewProps {
  allTransactions: UnifiedTransaction[];
  files?: CsvFileSummary[];
  onOpenUploadModal?: () => void;
}

export const CreditCardInvoicesView: React.FC<CreditCardInvoicesViewProps> = ({
  allTransactions,
  files = [],
  onOpenUploadModal,
}) => {
  const invoices = useMemo(() => {
    const map = new Map<
      string,
      {
        invoiceDate: string;
        invoiceMonth: string;
        fileName: string;
        grossPurchases: number;
        iofTotal: number;
        refundsTotal: number;
        paymentsReceived: number;
        netInvoiceTotal: number;
        items: UnifiedTransaction[];
      }
    >();

    for (const tx of allTransactions) {
      if (tx.source !== 'creditCard' || !tx.invoiceDate) continue;
      const key = tx.invoiceDate;
      if (!map.has(key)) {
        map.set(key, {
          invoiceDate: key,
          invoiceMonth: tx.invoiceMonth,
          fileName: tx.sourceFile,
          grossPurchases: 0,
          iofTotal: 0,
          refundsTotal: 0,
          paymentsReceived: 0,
          netInvoiceTotal: 0,
          items: [],
        });
      }

      const inv = map.get(key)!;
      inv.items.push(tx);

      if (tx.flowKind === 'expense') {
        const val = Math.abs(tx.rawAmount);
        inv.grossPurchases += val;
        inv.netInvoiceTotal += val;
      } else if (tx.flowKind === 'iof') {
        const val = Math.abs(tx.rawAmount);
        inv.iofTotal += val;
        inv.netInvoiceTotal += val;
      } else if (tx.flowKind === 'refund') {
        const val = Math.abs(tx.rawAmount);
        inv.refundsTotal += val;
        inv.netInvoiceTotal -= val;
      } else if (tx.flowKind === 'cc_payment') {
        inv.paymentsReceived += Math.abs(tx.rawAmount);
      }
    }

    return Array.from(map.values()).sort((a, b) =>
      b.invoiceDate.localeCompare(a.invoiceDate)
    );
  }, [allTransactions]);

  const [selectedInvoiceDate, setSelectedInvoiceDate] = useState<string>(
    invoices[0]?.invoiceDate || ''
  );
  const [groupMode, setGroupMode] = useState<'chronological' | 'grouped'>('grouped');

  const currentInvoice = useMemo(() => {
    return (
      invoices.find((i) => i.invoiceDate === selectedInvoiceDate) || invoices[0] || null
    );
  }, [invoices, selectedInvoiceDate]);

  // Grouped merchants inside the selected invoice
  const groupedMerchantsInInvoice = useMemo(() => {
    if (!currentInvoice) return [];
    const map = new Map<
      string,
      {
        merchantGroup: string;
        category: string;
        total: number;
        count: number;
        items: UnifiedTransaction[];
      }
    >();

    for (const tx of currentInvoice.items) {
      if (tx.flowKind === 'cc_payment') continue;
      const g = tx.merchantGroup;
      if (!map.has(g)) {
        map.set(g, {
          merchantGroup: g,
          category: tx.category,
          total: 0,
          count: 0,
          items: [],
        });
      }
      const entry = map.get(g)!;
      entry.items.push(tx);
      entry.total += tx.expenseAmount;
      if (tx.flowKind === 'expense') entry.count += 1;
    }

    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [currentInvoice]);

  if (!currentInvoice) {
    return (
      <div className="p-8 text-center text-slate-400">
        Nenhuma fatura de cartão de crédito encontrada em creditCard/.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <MissingStatementsTracker
        files={files}
        allTransactions={allTransactions}
        onOpenUploadModal={() => onOpenUploadModal?.()}
        defaultExpanded={false}
      />

      {/* Horizontal Invoice Selector */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-lg">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-violet-400" />
            <h2 className="text-base font-bold text-white">
              Faturas do Cartão Nubank ({invoices.length} faturas carregadas)
            </h2>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            Arquivo: creditCard/{currentInvoice.fileName}
          </span>
        </div>

        <div className="flex items-center gap-2.5 overflow-x-auto pb-2">
          {invoices.map((inv) => {
            const isSelected = inv.invoiceDate === currentInvoice.invoiceDate;
            return (
              <button
                key={inv.invoiceDate}
                onClick={() => setSelectedInvoiceDate(inv.invoiceDate)}
                className={`px-4 py-2.5 rounded-xl border text-left shrink-0 transition cursor-pointer ${
                  isSelected
                    ? 'bg-violet-600/25 border-violet-500 text-white shadow-lg'
                    : 'bg-slate-950/70 border-slate-800 text-slate-300 hover:bg-slate-800/60'
                }`}
              >
                <div className="text-[11px] text-slate-400 flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  <span>Venc. {formatDateBR(inv.invoiceDate)}</span>
                </div>
                <div className="text-sm font-bold mt-0.5">
                  {formatBRL(inv.netInvoiceTotal)}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected Invoice KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4">
          <span className="text-xs text-slate-400">Total Líquido de Compras na Fatura</span>
          <div className="text-2xl font-bold text-white mt-1">
            {formatBRL(currentInvoice.netInvoiceTotal)}
          </div>
          <span className="text-xs text-violet-400 mt-1 block">
            Fatura de {formatMonthFull(currentInvoice.invoiceMonth)}
          </span>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4">
          <span className="text-xs text-slate-400">Compras Brutas + IOF</span>
          <div className="text-xl font-bold text-rose-300 mt-1">
            {formatBRL(currentInvoice.grossPurchases)}
          </div>
          <span className="text-xs text-amber-300 mt-1 flex items-center gap-1">
            <Globe className="w-3.5 h-3.5" />
            IOF Internacional: {formatBRL(currentInvoice.iofTotal)}
          </span>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4">
          <span className="text-xs text-slate-400">Estornos e Descontos na Fatura</span>
          <div className="text-xl font-bold text-emerald-400 mt-1">
            - {formatBRL(currentInvoice.refundsTotal)}
          </div>
          <span className="text-xs text-slate-400 mt-1 block">
            Créditos abatidos automaticamente
          </span>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4">
          <span className="text-xs text-slate-400">Pagamentos Registrados no CSV</span>
          <div className="text-xl font-bold text-sky-300 mt-1">
            {formatBRL(currentInvoice.paymentsReceived)}
          </div>
          <span className="text-xs text-emerald-400 mt-1 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Conciliado sem dupla contagem
          </span>
        </div>
      </div>

      {/* View Mode Switcher & Invoice Content */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-base font-bold text-white">
              Lançamentos da Fatura ({currentInvoice.items.length} linhas)
            </h3>
            <p className="text-xs text-slate-400">
              Alterne entre a visão agrupada por estabelecimento na fatura ou a lista cronológica
            </p>
          </div>

          <div className="flex items-center gap-2 bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setGroupMode('grouped')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
                groupMode === 'grouped'
                  ? 'bg-violet-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Agrupado por Estabelecimento ({groupedMerchantsInInvoice.length})</span>
            </button>
            <button
              onClick={() => setGroupMode('chronological')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
                groupMode === 'chronological'
                  ? 'bg-violet-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Receipt className="w-3.5 h-3.5" />
              <span>Ordem Cronológica ({currentInvoice.items.length})</span>
            </button>
          </div>
        </div>

        {groupMode === 'grouped' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {groupedMerchantsInInvoice.map((gm) => (
              <div
                key={gm.merchantGroup}
                className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white text-sm truncate">
                      {gm.merchantGroup}
                    </span>
                    <span className="text-xs text-slate-400">({gm.items.length}x)</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <span
                      className="px-2 py-0.5 rounded-full text-[10px] font-medium"
                      style={{
                        backgroundColor: `${getCategoryColor(gm.category)}20`,
                        color: getCategoryColor(gm.category),
                      }}
                    >
                      {gm.category}
                    </span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-bold text-white">
                    {formatBRL(gm.total)}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {currentInvoice.netInvoiceTotal > 0
                      ? `${((gm.total / currentInvoice.netInvoiceTotal) * 100).toFixed(1)}% da fatura`
                      : ''}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 uppercase">
                  <th className="py-2.5 px-3">Data Compra</th>
                  <th className="py-2.5 px-3">Estabelecimento Agrupado</th>
                  <th className="py-2.5 px-3">Título Original na Fatura</th>
                  <th className="py-2.5 px-3">Categoria</th>
                  <th className="py-2.5 px-3">Tipo</th>
                  <th className="py-2.5 px-3 text-right">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {currentInvoice.items.map((tx) => (
                  <tr key={tx.id} className="hover:bg-slate-800/40">
                    <td className="py-2.5 px-3 font-mono text-slate-300">
                      {formatDateBR(tx.date)}
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-white">
                      {tx.merchantGroup}
                    </td>
                    <td className="py-2.5 px-3 text-slate-300">{tx.rawDescription}</td>
                    <td className="py-2.5 px-3">
                      <span
                        className="px-2 py-0.5 rounded-full text-[10px] font-medium"
                        style={{
                          backgroundColor: `${getCategoryColor(tx.category)}20`,
                          color: getCategoryColor(tx.category),
                        }}
                      >
                        {tx.category}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-400">{tx.operationType}</td>
                    <td
                      className={`py-2.5 px-3 text-right font-semibold ${
                        tx.flowKind === 'cc_payment'
                          ? 'text-sky-400'
                          : tx.flowKind === 'refund'
                          ? 'text-emerald-400'
                          : tx.flowKind === 'iof'
                          ? 'text-amber-300'
                          : 'text-rose-300'
                      }`}
                    >
                      {tx.rawAmount < 0
                        ? `- ${formatBRL(Math.abs(tx.rawAmount))}`
                        : formatBRL(tx.rawAmount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
