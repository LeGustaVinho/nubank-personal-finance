import React, { useMemo, useState } from 'react';
import {
  BrainCircuit,
  Sparkles,
  CheckCircle2,
  Fingerprint,
  Cpu,
  TrendingUp,
  Trash2,
  ShieldCheck,
  X,
  PlusCircle,
  Terminal,
  Play,
  MessageSquareText,
  Loader2,
  Bot,
} from 'lucide-react';
import {
  UnifiedTransaction,
  SmartSuggestion,
  BehavioralInsight,
  LearnedPatternEntry,
  GroupingRule,
} from '../../server/types';
import {
  AgyCliStatus,
  AgyAiBatchResult,
} from '../../server/agyCliBridge';
import { formatBRL, getCategoryColor } from '../utils/formatters';

interface IntelligencePatternsViewProps {
  transactions: UnifiedTransaction[];
  rules: GroupingRule[];
  learnedPatterns: LearnedPatternEntry[];
  smartSuggestions: SmartSuggestion[];
  behavioralInsights: BehavioralInsight[];
  agyStatus: AgyCliStatus | null;
  onApproveSuggestion: (sug: SmartSuggestion) => Promise<void>;
  onDismissSuggestion: (sugId: string) => Promise<void>;
  onDeleteLearnedPattern: (id: string) => Promise<void>;
  onRunAgyClassify: (params: {
    modelId: string;
    scope: 'unmatched_only' | 'all_merchants';
    autoApply: boolean;
  }) => Promise<AgyAiBatchResult>;
  onAskAgyAdvisor: (params: {
    question: string;
    modelId: string;
  }) => Promise<{
    status: 'SUCCESS' | 'ERROR';
    observedModel: string | null;
    answer: string;
    durationMs: number;
    error?: string;
  }>;
}

export const IntelligencePatternsView: React.FC<
  IntelligencePatternsViewProps
> = ({
  transactions,
  rules,
  learnedPatterns,
  smartSuggestions,
  behavioralInsights,
  agyStatus,
  onApproveSuggestion,
  onDismissSuggestion,
  onDeleteLearnedPattern,
  onRunAgyClassify,
  onAskAgyAdvisor,
}) => {
  // Antigravity / Gemini CLI state
  const [selectedModel, setSelectedModel] = useState<string>('gemini-3.8-flash-low');
  const [classifyScope, setClassifyScope] = useState<'unmatched_only' | 'all_merchants'>(
    'unmatched_only'
  );
  const [isClassifyingAi, setIsClassifyingAi] = useState(false);
  const [lastAiBatchResult, setLastAiBatchResult] = useState<AgyAiBatchResult | null>(
    null
  );

  // Financial Advisor AI state
  const [advisorQuestion, setAdvisorQuestion] = useState(
    'Faça um diagnóstico executivo completo das minhas finanças, apontando oportunidades claras de economia e analisando meus gastos com Delivery, Uber e Assinaturas.'
  );
  const [isAskingAdvisor, setIsAskingAdvisor] = useState(false);
  const [advisorResponse, setAdvisorResponse] = useState<{
    observedModel: string | null;
    answer: string;
    durationMs: number;
    error?: string;
  } | null>(null);

  const stats = useMemo(() => {
    let highConfidenceCount = 0;
    let docMatchedCount = 0;
    let gatewayUnpackedCount = 0;
    let semanticAiCount = 0;
    const uniqueDocs = new Map<
      string,
      { doc: string; merchantGroup: string; category: string; count: number; total: number }
    >();
    const gatewayBreakdown = new Map<string, { count: number; total: number }>();

    for (const tx of transactions) {
      if (tx.confidence >= 80) highConfidenceCount++;
      if (tx.classificationSource === 'semantic-ai') semanticAiCount++;
      if (tx.documentId) {
        docMatchedCount++;
        const prev = uniqueDocs.get(tx.documentId) || {
          doc: tx.documentId,
          merchantGroup: tx.merchantGroup,
          category: tx.category,
          count: 0,
          total: 0,
        };
        prev.count += 1;
        prev.total += Math.abs(tx.rawAmount);
        uniqueDocs.set(tx.documentId, prev);
      }
      if (tx.gateway) {
        gatewayUnpackedCount++;
        const gPrev = gatewayBreakdown.get(tx.gateway) || { count: 0, total: 0 };
        gPrev.count += 1;
        gPrev.total += Math.abs(tx.rawAmount);
        gatewayBreakdown.set(tx.gateway, gPrev);
      }
    }

    const coveragePct =
      transactions.length > 0
        ? (highConfidenceCount / transactions.length) * 100
        : 100;

    return {
      highConfidenceCount,
      coveragePct,
      docMatchedCount,
      uniqueDocsCount: uniqueDocs.size,
      uniqueDocsList: Array.from(uniqueDocs.values()).sort(
        (a, b) => b.count - a.count
      ),
      gatewayUnpackedCount,
      gatewayList: Array.from(gatewayBreakdown.entries()).sort(
        (a, b) => b[1].count - a[1].count
      ),
      semanticAiCount,
    };
  }, [transactions]);

  const handleTriggerClassify = async () => {
    setIsClassifyingAi(true);
    try {
      const res = await onRunAgyClassify({
        modelId: selectedModel,
        scope: classifyScope,
        autoApply: true,
      });
      setLastAiBatchResult(res);
    } finally {
      setIsClassifyingAi(false);
    }
  };

  const handleTriggerAdvisor = async (customPrompt?: string) => {
    const q = customPrompt || advisorQuestion;
    if (!q.trim()) return;
    if (customPrompt) setAdvisorQuestion(customPrompt);
    setIsAskingAdvisor(true);
    try {
      const res = await onAskAgyAdvisor({
        question: q,
        modelId: selectedModel,
      });
      setAdvisorResponse(res);
    } finally {
      setIsAskingAdvisor(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Antigravity / Gemini CLI Local Integration Panel */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-violet-950/50 border border-violet-500/40 rounded-2xl p-5 shadow-xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-violet-600/20 border border-violet-500/40 flex items-center justify-center text-violet-300">
              <Terminal className="w-6 h-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-bold text-white">
                  Integração CLI Local — Antigravity / Gemini AI (`agy.exe`)
                </h2>
                {agyStatus?.available ? (
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[11px] font-semibold flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    Conectado (agy v{agyStatus.version})
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 text-[11px]">
                    CLI não detectado
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Conecta diretamente ao seu CLI local (<code>{agyStatus?.executablePath || 'agy.exe'}</code>) via protocolo <code>stream-json</code> para identificar, agrupar e auditar transações com IA.
              </p>
            </div>
          </div>

          {/* Model & Scope Controls */}
          <div className="flex flex-wrap items-center gap-2.5">
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs font-medium text-white focus:outline-none focus:border-violet-500"
            >
              {(agyStatus?.supportedModels || [
                { id: 'gemini-3.8-flash-low', label: 'Gemini 3.8 Flash (Low - Rápido)' },
                { id: 'gemini-3.8-flash-medium', label: 'Gemini 3.8 Flash (Medium)' },
                { id: 'gemini-4-argon-low', label: 'Gemini 4 Argon (Low)' },
                { id: 'gemini-4-argon-medium', label: 'Gemini 4 Argon (Medium - Profundo)' },
              ]).map((m) => (
                <option key={m.id} value={m.id}>
                  Modelo CLI: {m.label}
                </option>
              ))}
            </select>

            <select
              value={classifyScope}
              onChange={(e) => setClassifyScope(e.target.value as any)}
              className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-violet-500"
            >
              <option value="unmatched_only">
                Escopo: Itens sem regra fixa / Novos lançamentos
              </option>
              <option value="all_merchants">
                Escopo: Auditar Top Estabelecimentos Atuais
              </option>
            </select>

            <button
              disabled={isClassifyingAi || !agyStatus?.available}
              onClick={handleTriggerClassify}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-xs font-bold shadow-lg shadow-violet-600/30 transition cursor-pointer"
            >
              {isClassifyingAi ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Processando no Gemini CLI...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  <span>Identificar & Classificar com IA Agora</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* AI Batch Classification Results Display */}
        {lastAiBatchResult && (
          <div className="bg-slate-950/90 border border-violet-500/40 rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-violet-400" />
                <span className="font-bold text-white">
                  Resultado do Antigravity CLI ({lastAiBatchResult.observedModel || selectedModel})
                </span>
                <span className="text-slate-400">
                  • Tempo: {(lastAiBatchResult.durationMs / 1000).toFixed(1)}s •{' '}
                  {lastAiBatchResult.classifications.length} grupos aprendidos e salvos!
                </span>
              </div>
              <button
                onClick={() => setLastAiBatchResult(null)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                Fechar resultado
              </button>
            </div>

            {lastAiBatchResult.error && (
              <div className="p-3 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs">
                {lastAiBatchResult.error}
              </div>
            )}

            {lastAiBatchResult.financialSummaryAdvice && (
              <div className="p-3 rounded-xl bg-violet-500/10 border border-violet-500/20 text-xs text-slate-200 leading-relaxed">
                <strong className="text-violet-300 block mb-1">
                  Parecer da IA sobre o lote analisado:
                </strong>
                {lastAiBatchResult.financialSummaryAdvice}
              </div>
            )}

            {lastAiBatchResult.classifications.length > 0 && (
              <div className="max-h-72 overflow-y-auto border border-slate-800 rounded-xl">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-900 sticky top-0 text-slate-400">
                    <tr>
                      <th className="py-2 px-3">Descrição Original</th>
                      <th className="py-2 px-3">Grupo Identificado pela IA</th>
                      <th className="py-2 px-3">Categoria Atribuída</th>
                      <th className="py-2 px-3">Explicação da IA</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {lastAiBatchResult.classifications.map((c, idx) => (
                      <tr key={idx} className="hover:bg-slate-900/50">
                        <td className="py-2 px-3 text-slate-300 font-mono text-[11px] max-w-xs truncate">
                          {c.extractedCounterparty || c.rawSample}
                        </td>
                        <td className="py-2 px-3 font-bold text-white">
                          {c.suggestedMerchantGroup}
                        </td>
                        <td className="py-2 px-3">
                          <span
                            className="px-2 py-0.5 rounded-full text-[10px] font-medium"
                            style={{
                              backgroundColor: `${getCategoryColor(c.suggestedCategory)}20`,
                              color: getCategoryColor(c.suggestedCategory),
                            }}
                          >
                            {c.suggestedCategory}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-slate-400">{c.reasoning}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* AI Financial Advisor Interactive Box */}
        <div className="pt-2 border-t border-slate-800/80 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
              <MessageSquareText className="w-4 h-4 text-violet-400" />
              <span>Consultor Financeiro Pessoal via Antigravity / Gemini CLI:</span>
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                'Onde posso economizar R$ 1.000 por mês?',
                'Analise meus gastos com iFood, Restaurantes e Uber',
                'Audite minhas assinaturas digitais e gastos com IOF',
              ].map((preset) => (
                <button
                  key={preset}
                  disabled={isAskingAdvisor}
                  onClick={() => handleTriggerAdvisor(preset)}
                  className="px-2.5 py-1 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-[11px] text-violet-200 border border-slate-700 transition cursor-pointer"
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={advisorQuestion}
              onChange={(e) => setAdvisorQuestion(e.target.value)}
              placeholder="Pergunte qualquer coisa sobre seus gastos para o Gemini CLI..."
              className="flex-1 px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-violet-500"
            />
            <button
              disabled={isAskingAdvisor || !agyStatus?.available}
              onClick={() => handleTriggerAdvisor()}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 shrink-0 cursor-pointer"
            >
              {isAskingAdvisor ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Consultando CLI...</span>
                </>
              ) : (
                <>
                  <Bot className="w-3.5 h-3.5" />
                  <span>Perguntar ao Gemini CLI</span>
                </>
              )}
            </button>
          </div>

          {advisorResponse && (
            <div className="p-4 rounded-xl bg-slate-950 border border-emerald-500/30 text-xs text-slate-200 space-y-2">
              <div className="flex items-center justify-between text-[11px] text-emerald-400 font-semibold border-b border-slate-800 pb-2">
                <span>
                  Resposta do Antigravity CLI ({advisorResponse.observedModel || selectedModel}) em{' '}
                  {(advisorResponse.durationMs / 1000).toFixed(1)}s
                </span>
                <button
                  onClick={() => setAdvisorResponse(null)}
                  className="text-slate-400 hover:text-white cursor-pointer"
                >
                  Fechar
                </button>
              </div>
              {advisorResponse.error ? (
                <p className="text-rose-400">{advisorResponse.error}</p>
              ) : (
                <div className="whitespace-pre-wrap leading-relaxed text-slate-200">
                  {advisorResponse.answer}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Brain Overview Header Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-400 uppercase">
              Precisão & Cobertura IA
            </span>
            <div className="p-2 rounded-xl bg-violet-500/15 text-violet-400">
              <BrainCircuit className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white">
            {stats.coveragePct.toFixed(1)}%
          </div>
          <p className="text-xs text-slate-400 mt-1">
            {stats.highConfidenceCount} de {transactions.length} transações com alta confiança
          </p>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-400 uppercase">
              Vínculo por CPF / CNPJ
            </span>
            <div className="p-2 rounded-xl bg-emerald-500/15 text-emerald-400">
              <Fingerprint className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-emerald-400">
            {stats.uniqueDocsCount} entidades
          </div>
          <p className="text-xs text-slate-400 mt-1">
            {stats.docMatchedCount} transferências unificadas pelo documento
          </p>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-400 uppercase">
              Gateways Desempacotados
            </span>
            <div className="p-2 rounded-xl bg-sky-500/15 text-sky-400">
              <Cpu className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-sky-300">
            {stats.gatewayUnpackedCount} compras
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Prefixos Ifd*, Dl*, Mp*, Paypal*, Amazonmktplc* limpos
          </p>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-400 uppercase">
              Base de Conhecimento Ativa
            </span>
            <div className="p-2 rounded-xl bg-amber-500/15 text-amber-400">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-amber-300">
            {rules.length + learnedPatterns.length} padrões
          </div>
          <p className="text-xs text-slate-400 mt-1">
            {rules.length} regras de grupo + {learnedPatterns.length} aprendidos via IA/Usuário
          </p>
        </div>
      </div>

      {/* Behavioral Insights Grid */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-lg">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-5 h-5 text-violet-400" />
          <div>
            <h2 className="text-base font-bold text-white">
              Diagnóstico de Hábitos & Padrões Descobertos nos Seus Dados
            </h2>
            <p className="text-xs text-slate-400">
              Padrões extraídos automaticamente do cruzamento entre Conta Corrente e Cartão de Crédito
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {behavioralInsights.map((ins) => (
            <div
              key={ins.id}
              className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-white">{ins.title}</span>
                <span className="px-2.5 py-0.5 rounded-full bg-violet-500/15 text-violet-300 text-xs font-semibold">
                  {ins.metric}
                </span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                {ins.detail}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Smart Suggestions & Continuous Learning Queue */}
      {smartSuggestions.length > 0 && (
        <div className="bg-slate-900/90 border border-violet-500/40 rounded-2xl p-5 shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-violet-400" />
              <div>
                <h2 className="text-base font-bold text-white">
                  Sugestões Inteligentes & Alertas de Padrão ({smartSuggestions.length})
                </h2>
                <p className="text-xs text-slate-400">
                  Aprove com 1 clique para ensinar permanentemente ao cérebro financeiro
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {smartSuggestions.map((sug) => (
              <div
                key={sug.id}
                className="p-4 rounded-xl bg-slate-950/90 border border-slate-800 flex flex-col justify-between gap-3"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-white">
                      {sug.title}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-300 shrink-0">
                      {sug.confidence}% confiança
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">{sug.description}</p>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <span
                      className="px-2 py-0.5 rounded-full text-[10px] font-medium"
                      style={{
                        backgroundColor: `${getCategoryColor(sug.suggestedCategory)}20`,
                        color: getCategoryColor(sug.suggestedCategory),
                      }}
                    >
                      {sug.suggestedCategory}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      Impacto: <strong className="text-white">{formatBRL(sug.totalAmount)}</strong>
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800/80">
                  <button
                    onClick={() => onDismissSuggestion(sug.id)}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white text-xs flex items-center gap-1 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Ignorar</span>
                  </button>
                  {sug.patternsToLearn.length > 0 && (
                    <button
                      onClick={() => onApproveSuggestion(sug)}
                      className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                    >
                      <PlusCircle className="w-3.5 h-3.5" />
                      <span>Fixar Padrão no Cérebro</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Learned Patterns Memory & Document Identity Map */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Document Identity Resolution Table */}
        <div className="lg:col-span-7 bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-lg">
          <div className="flex items-center gap-2 mb-3">
            <Fingerprint className="w-5 h-5 text-emerald-400" />
            <div>
              <h3 className="text-sm font-bold text-white">
                Identidades Unificadas por CPF / CNPJ ({stats.uniqueDocsCount})
              </h3>
              <p className="text-xs text-slate-400">
                Mesmo que o nome mude na descrição do Pix, o sistema reconhece a pessoa/empresa pelo documento
              </p>
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto border border-slate-800 rounded-xl">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-950 sticky top-0 text-slate-400">
                <tr>
                  <th className="py-2 px-3">CPF / CNPJ</th>
                  <th className="py-2 px-3">Entidade Unificada</th>
                  <th className="py-2 px-3">Categoria</th>
                  <th className="py-2 px-3 text-center">Qtd</th>
                  <th className="py-2 px-3 text-right">Volume</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {stats.uniqueDocsList.map((d) => (
                  <tr key={d.doc} className="hover:bg-slate-800/40">
                    <td className="py-2 px-3 font-mono text-emerald-300 whitespace-nowrap">
                      {d.doc}
                    </td>
                    <td className="py-2 px-3 font-semibold text-white">
                      {d.merchantGroup}
                    </td>
                    <td className="py-2 px-3">
                      <span
                        className="px-2 py-0.5 rounded-full text-[10px] font-medium"
                        style={{
                          backgroundColor: `${getCategoryColor(d.category)}20`,
                          color: getCategoryColor(d.category),
                        }}
                      >
                        {d.category}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-center text-slate-300">
                      {d.count}x
                    </td>
                    <td className="py-2 px-3 text-right font-semibold text-slate-200">
                      {formatBRL(d.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Gateways & User Learned Memory */}
        <div className="lg:col-span-5 space-y-6">
          {/* Gateways Unpacked */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-lg">
            <h3 className="text-sm font-bold text-white mb-1 flex items-center gap-2">
              <Cpu className="w-4 h-4 text-sky-400" />
              <span>Intermediadores e Gateways Reconhecidos</span>
            </h3>
            <p className="text-xs text-slate-400 mb-3">
              Prefixos de maquininhas e carteiras digitais interpretados automaticamente
            </p>
            <div className="space-y-2">
              {stats.gatewayList.map(([gw, info]) => (
                <div
                  key={gw}
                  className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center justify-between text-xs"
                >
                  <div>
                    <span className="font-semibold text-white">{gw}</span>
                    <span className="text-slate-400 ml-2">({info.count} transações)</span>
                  </div>
                  <span className="font-bold text-sky-300">
                    {formatBRL(info.total)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Learned Memory (AI + User) */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-lg">
            <h3 className="text-sm font-bold text-white mb-1 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-violet-400" />
              <span>Padrões Aprendidos via IA / Edições ({learnedPatterns.length})</span>
            </h3>
            <p className="text-xs text-slate-400 mb-3">
              Padrões memorizados pelo Antigravity CLI e pelas suas classificações
            </p>

            {learnedPatterns.length === 0 ? (
              <div className="p-4 rounded-xl bg-slate-950/50 border border-slate-800 text-xs text-slate-400 text-center">
                Clique em <strong>"Identificar & Classificar com IA Agora"</strong> acima para que o Antigravity CLI analise e grave novos padrões aqui!
              </div>
            ) : (
              <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                {learnedPatterns.map((lp) => (
                  <div
                    key={lp.id}
                    className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="font-bold text-white truncate">
                        {lp.merchantGroup}{' '}
                        <span className="text-[10px] font-mono text-violet-300">
                          [{lp.keyType}: {lp.keyValue}]
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400">{lp.category}</div>
                    </div>
                    <button
                      onClick={() => onDeleteLearnedPattern(lp.id)}
                      className="p-1 text-rose-400 hover:bg-rose-500/15 rounded cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
