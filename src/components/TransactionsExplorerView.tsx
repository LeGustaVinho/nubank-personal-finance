import React, { useMemo, useState } from 'react';
import {
  Search,
  Filter,
  Download,
  Edit3,
  Check,
  X,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import {
  UnifiedTransaction,
  SourceType,
  FlowKind,
  TransactionOverride,
} from '../../server/types';
import {
  formatBRL,
  formatDateBR,
  getCategoryColor,
} from '../utils/formatters';

interface TransactionsExplorerViewProps {
  transactions: UnifiedTransaction[];
  categories: string[];
  onOverrideTransaction: (
    txId: string,
    override: TransactionOverride
  ) => Promise<void>;
  onCreateRuleFromTransaction: (
    tx: UnifiedTransaction,
    newGroup: string,
    newCategory: string
  ) => Promise<void>;
}

type SortField =
  | 'date'
  | 'amount'
  | 'merchantGroup'
  | 'category'
  | 'source'
  | 'rawDescription';

type SortDirection = 'asc' | 'desc';

export const TransactionsExplorerView: React.FC<
  TransactionsExplorerViewProps
> = ({
  transactions,
  categories,
  onOverrideTransaction,
  onCreateRuleFromTransaction,
}) => {
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'ALL' | SourceType>('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [flowFilter, setFlowFilter] = useState<'ALL' | FlowKind>('ALL');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [page, setPage] = useState(1);
  const pageSize = 40;

  // Inline Editing State
  const [editingTxId, setEditingTxId] = useState<string | null>(null);
  const [editGroup, setEditGroup] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [applyToAllSimilar, setApplyToAllSimilar] = useState(true);

  const handleHeaderSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection(field === 'date' || field === 'amount' ? 'desc' : 'asc');
    }
    setPage(1);
  };

  const handleDropdownSortChange = (combinedValue: string) => {
    const [field, dir] = combinedValue.split(':') as [SortField, SortDirection];
    setSortField(field);
    setSortDirection(dir);
    setPage(1);
  };

  const filtered = useMemo(() => {
    const list = transactions.filter((tx) => {
      if (sourceFilter !== 'ALL' && tx.source !== sourceFilter) return false;
      if (categoryFilter !== 'ALL' && tx.category !== categoryFilter)
        return false;
      if (flowFilter !== 'ALL' && tx.flowKind !== flowFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const hay = `${tx.merchantGroup} ${tx.rawDescription} ${tx.category} ${tx.operationType} ${tx.sourceFile} ${tx.documentId || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const mult = sortDirection === 'asc' ? 1 : -1;

    return list.sort((a, b) => {
      if (sortField === 'date') {
        if (a.date !== b.date) return a.date.localeCompare(b.date) * mult;
        return (Math.abs(a.rawAmount) - Math.abs(b.rawAmount)) * mult;
      }
      if (sortField === 'amount') {
        const diff = Math.abs(a.rawAmount) - Math.abs(b.rawAmount);
        if (diff !== 0) return diff * mult;
        return b.date.localeCompare(a.date);
      }
      if (sortField === 'merchantGroup') {
        const cmp = a.merchantGroup.localeCompare(b.merchantGroup, 'pt-BR');
        if (cmp !== 0) return cmp * mult;
        return b.date.localeCompare(a.date);
      }
      if (sortField === 'category') {
        const cmp = a.category.localeCompare(b.category, 'pt-BR');
        if (cmp !== 0) return cmp * mult;
        return (Math.abs(b.rawAmount) - Math.abs(a.rawAmount));
      }
      if (sortField === 'source') {
        const cmp = a.source.localeCompare(b.source);
        if (cmp !== 0) return cmp * mult;
        return b.date.localeCompare(a.date);
      }
      if (sortField === 'rawDescription') {
        const cmp = a.rawDescription.localeCompare(b.rawDescription, 'pt-BR');
        if (cmp !== 0) return cmp * mult;
        return b.date.localeCompare(a.date);
      }
      return 0;
    });
  }, [
    transactions,
    sourceFilter,
    categoryFilter,
    flowFilter,
    search,
    sortField,
    sortDirection,
  ]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page]);

  const totals = useMemo(() => {
    let expenses = 0;
    let income = 0;
    for (const tx of filtered) {
      expenses += tx.expenseAmount;
      income += tx.incomeAmount;
    }
    return { expenses, income };
  }, [filtered]);

  const startEditing = (tx: UnifiedTransaction) => {
    setEditingTxId(tx.id);
    setEditGroup(tx.merchantGroup);
    setEditCategory(tx.category);
    setApplyToAllSimilar(true);
  };

  const saveEdit = async (tx: UnifiedTransaction) => {
    if (!editGroup.trim()) return;
    if (applyToAllSimilar) {
      await onCreateRuleFromTransaction(tx, editGroup.trim(), editCategory);
    } else {
      await onOverrideTransaction(tx.id, {
        merchantGroup: editGroup.trim(),
        category: editCategory,
      });
    }
    setEditingTxId(null);
  };

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3.5 h-3.5 text-slate-600 group-hover:text-slate-400" />;
    }
    return sortDirection === 'asc' ? (
      <ArrowUp className="w-3.5 h-3.5 text-violet-400" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 text-violet-400" />
    );
  };

  const exportFilteredToCsv = () => {
    const headers = [
      'Data',
      'Origem',
      'Arquivo',
      'Grupo Estabelecimento',
      'Categoria',
      'Tipo Operacao',
      'Fluxo',
      'Valor',
      'Descricao Original',
    ];
    const rows = filtered.map((tx) => [
      tx.date,
      tx.source === 'creditCard' ? 'Cartão de Crédito' : 'Conta Corrente',
      tx.sourceFile,
      `"${tx.merchantGroup.replace(/"/g, '""')}"`,
      `"${tx.category.replace(/"/g, '""')}"`,
      `"${tx.operationType.replace(/"/g, '""')}"`,
      tx.flowKind,
      tx.signedCashflow.toFixed(2),
      `"${tx.rawDescription.replace(/"/g, '""')}"`,
    ]);

    const csvContent =
      '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `transacoes_filtradas_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      {/* Filter & Sort Controls Card */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-violet-400" />
            <div>
              <h2 className="text-base font-bold text-white">
                Explorador Completo de Transações ({filtered.length} registros)
              </h2>
              <p className="text-xs text-slate-400">
                Filtre, pesquise e clique em qualquer coluna da tabela (ou no seletor abaixo) para ordenar os resultados
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs">
            <div className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-slate-400 mr-1.5">Despesas no filtro:</span>
              <span className="font-bold text-rose-400">
                {formatBRL(totals.expenses)}
              </span>
            </div>
            <div className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-slate-400 mr-1.5">Receitas no filtro:</span>
              <span className="font-bold text-emerald-400">
                {formatBRL(totals.income)}
              </span>
            </div>
            <button
              onClick={exportFilteredToCsv}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-medium cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Exportar CSV</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3">
          {/* Search Input */}
          <div className="lg:col-span-4 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Pesquisar texto, CNPJ, pessoa, loja..."
              className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-violet-500"
            />
            {search && (
              <button
                onClick={() => {
                  setSearch('');
                  setPage(1);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white cursor-pointer"
              >
                Limpar
              </button>
            )}
          </div>

          {/* Origin Filter */}
          <div className="lg:col-span-2">
            <select
              value={sourceFilter}
              onChange={(e) => {
                setSourceFilter(e.target.value as any);
                setPage(1);
              }}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-violet-500"
            >
              <option value="ALL">Origem: Conta + Cartão</option>
              <option value="creditCard">Apenas Cartão</option>
              <option value="bankAccount">Apenas Conta</option>
            </select>
          </div>

          {/* Category Filter */}
          <div className="lg:col-span-2">
            <select
              value={categoryFilter}
              onChange={(e) => {
                setCategoryFilter(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-violet-500"
            >
              <option value="ALL">Todas Categorias</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* Flow Type Filter */}
          <div className="lg:col-span-2">
            <select
              value={flowFilter}
              onChange={(e) => {
                setFlowFilter(e.target.value as any);
                setPage(1);
              }}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-violet-500"
            >
              <option value="ALL">Todos os Tipos</option>
              <option value="expense">Compras / Despesas</option>
              <option value="income">Receitas / Entradas</option>
              <option value="iof">IOF Internacional</option>
              <option value="refund">Estornos / Reembolsos</option>
              <option value="investment">RDB / Investimentos</option>
              <option value="cc_payment">Pagamento Fatura</option>
            </select>
          </div>

          {/* Sort Dropdown */}
          <div className="lg:col-span-2">
            <select
              value={`${sortField}:${sortDirection}`}
              onChange={(e) => handleDropdownSortChange(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-violet-500/40 rounded-xl text-xs font-medium text-violet-200 focus:outline-none focus:border-violet-500"
            >
              <option value="date:desc">Ordenar: Data (Mais recentes)</option>
              <option value="date:asc">Ordenar: Data (Mais antigas)</option>
              <option value="amount:desc">Ordenar: Maior Valor</option>
              <option value="amount:asc">Ordenar: Menor Valor</option>
              <option value="merchantGroup:asc">Ordenar: Estabelecimento (A–Z)</option>
              <option value="merchantGroup:desc">Ordenar: Estabelecimento (Z–A)</option>
              <option value="category:asc">Ordenar: Categoria (A–Z)</option>
              <option value="category:desc">Ordenar: Categoria (Z–A)</option>
              <option value="source:asc">Ordenar: Origem (Conta/Cartão)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Transactions Table with Sortable Headers */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl shadow-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 uppercase select-none">
                <th
                  onClick={() => handleHeaderSort('date')}
                  className="py-3 px-3 cursor-pointer hover:text-white transition group"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Data</span>
                    {renderSortIcon('date')}
                  </div>
                </th>
                <th
                  onClick={() => handleHeaderSort('source')}
                  className="py-3 px-3 cursor-pointer hover:text-white transition group"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Origem</span>
                    {renderSortIcon('source')}
                  </div>
                </th>
                <th
                  onClick={() => handleHeaderSort('merchantGroup')}
                  className="py-3 px-3 cursor-pointer hover:text-white transition group"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Grupo / Estabelecimento</span>
                    {renderSortIcon('merchantGroup')}
                  </div>
                </th>
                <th
                  onClick={() => handleHeaderSort('category')}
                  className="py-3 px-3 cursor-pointer hover:text-white transition group"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Categoria</span>
                    {renderSortIcon('category')}
                  </div>
                </th>
                <th
                  onClick={() => handleHeaderSort('rawDescription')}
                  className="py-3 px-3 cursor-pointer hover:text-white transition group"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Operação & Descrição Original</span>
                    {renderSortIcon('rawDescription')}
                  </div>
                </th>
                <th
                  onClick={() => handleHeaderSort('amount')}
                  className="py-3 px-3 text-right cursor-pointer hover:text-white transition group"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>Valor</span>
                    {renderSortIcon('amount')}
                  </div>
                </th>
                <th className="py-3 px-3 text-center">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {paginated.map((tx) => {
                const isEditing = editingTxId === tx.id;
                return (
                  <tr key={tx.id} className="hover:bg-slate-800/40">
                    <td className="py-3 px-3 font-mono text-slate-300 whitespace-nowrap">
                      {formatDateBR(tx.date)}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
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

                    {/* Group Column */}
                    <td className="py-3 px-3 font-semibold text-white">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editGroup}
                          onChange={(e) => setEditGroup(e.target.value)}
                          className="px-2 py-1 bg-slate-950 border border-violet-500 rounded text-xs text-white w-44"
                        />
                      ) : (
                        tx.merchantGroup
                      )}
                    </td>

                    {/* Category Column */}
                    <td className="py-3 px-3">
                      {isEditing ? (
                        <div className="space-y-1">
                          <select
                            value={editCategory}
                            onChange={(e) => setEditCategory(e.target.value)}
                            className="px-2 py-1 bg-slate-950 border border-violet-500 rounded text-xs text-white"
                          >
                            {categories.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                          <label className="flex items-center gap-1 text-[10px] text-slate-300">
                            <input
                              type="checkbox"
                              checked={applyToAllSimilar}
                              onChange={(e) =>
                                setApplyToAllSimilar(e.target.checked)
                              }
                            />
                            <span>Aplicar a similares</span>
                          </label>
                        </div>
                      ) : (
                        <span
                          className="px-2.5 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap"
                          style={{
                            backgroundColor: `${getCategoryColor(tx.category)}20`,
                            color: getCategoryColor(tx.category),
                          }}
                        >
                          {tx.category}
                        </span>
                      )}
                    </td>

                    {/* Description Column */}
                    <td className="py-3 px-3 max-w-md">
                      <div
                        className="text-slate-200 truncate"
                        title={tx.rawDescription}
                      >
                        {tx.rawDescription}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono truncate">
                        {tx.operationType} • {tx.sourceFile}
                      </div>
                    </td>

                    {/* Amount Column */}
                    <td
                      className={`py-3 px-3 text-right font-semibold whitespace-nowrap ${
                        tx.flowKind === 'income' || tx.flowKind === 'refund'
                          ? 'text-emerald-400'
                          : tx.flowKind === 'cc_payment' ||
                            tx.flowKind === 'investment'
                          ? 'text-slate-400'
                          : tx.flowKind === 'iof'
                          ? 'text-amber-300'
                          : 'text-rose-300'
                      }`}
                    >
                      {tx.flowKind === 'income'
                        ? `+ ${formatBRL(tx.incomeAmount)}`
                        : tx.flowKind === 'refund'
                        ? `- ${formatBRL(Math.abs(tx.rawAmount))}`
                        : formatBRL(Math.abs(tx.rawAmount))}
                    </td>

                    {/* Actions Column */}
                    <td className="py-3 px-3 text-center whitespace-nowrap">
                      {isEditing ? (
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => saveEdit(tx)}
                            className="p-1 rounded bg-emerald-600 text-white hover:bg-emerald-500 cursor-pointer"
                            title="Salvar"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setEditingTxId(null)}
                            className="p-1 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 cursor-pointer"
                            title="Cancelar"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => startEditing(tx)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                          title="Editar Grupo / Categoria"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="px-4 py-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <span>
            Exibindo {filtered.length > 0 ? (page - 1) * pageSize + 1 : 0}–
            {Math.min(page * pageSize, filtered.length)} de {filtered.length}{' '}
            lançamentos
          </span>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1 rounded-lg bg-slate-800 disabled:opacity-40 text-slate-200 cursor-pointer"
            >
              Anterior
            </button>
            <span className="text-slate-300 font-medium">
              Página {page} de {totalPages}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="px-3 py-1 rounded-lg bg-slate-800 disabled:opacity-40 text-slate-200 cursor-pointer"
            >
              Próxima
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
