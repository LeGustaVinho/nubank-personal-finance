export type SourceType = 'bankAccount' | 'creditCard';

export type FlowKind =
  | 'expense'           // Despesa real de consumo (compra no cartão, pix enviado para comércio/pessoa, boleto, débito)
  | 'income'            // Receita (transferência recebida, salário/PJ, câmbio Wise, restituição IR)
  | 'refund'            // Estorno / Reembolso / Desconto de antecipação (reduz o gasto da categoria/merchant)
  | 'iof'               // IOF de compra internacional (vinculado ao merchant original)
  | 'cc_payment'        // Pagamento de fatura (conta -> cartão) ou Pagamento recebido (cartão) - neutro para evitar dupla contagem
  | 'investment'        // Aplicação RDB / CDB ou Resgate RDB
  | 'internal_transfer';// Valor adicionado na conta por cartão ou transferência própria

export interface InstallmentInfo {
  current: number;
  total: number;
  baseMerchantTitle: string;
}

export type ClassificationSource =
  | 'manual-override'
  | 'learned-document'
  | 'learned-pattern'
  | 'custom-rule'
  | 'system-rule'
  | 'document-cluster'
  | 'semantic-ai'
  | 'fallback';

export interface UnifiedTransaction {
  id: string;
  source: SourceType;
  sourceFile: string;
  /** YYYY-MM-DD (Data real da transação/compra) */
  date: string;
  /** YYYY-MM derivado de `date` (Mês de Competência) */
  competenceMonth: string;
  /** Para cartão de crédito: YYYY-MM-DD da fatura (ex: 2026-01-03). Para conta: null */
  invoiceDate: string | null;
  /** Para cartão de crédito: YYYY-MM da fatura (ex: 2026-01). Para conta: competenceMonth */
  invoiceMonth: string;
  /** Título ou Descrição original exatamente como veio no CSV */
  rawDescription: string;
  /** Tipo de operação extraído (ex: 'Pix Enviado', 'Compra no Crédito', 'Boleto', 'IOF', etc.) */
  operationType: string;
  /** Nome limpo extraído antes de aplicar regras de agrupamento */
  extractedCounterparty: string;
  /** Documento CPF/CNPJ extraído da descrição quando presente */
  documentId: string | null;
  /** Gateway/Intermediador detectado no título (ex: 'iFood', 'Mercado Pago', 'PayPal', 'DLocal') */
  gateway: string | null;
  /** Sub-detalhe se houver (ex: restaurante específico dentro do Ifd* ou CNPJ/Banco no Pix) */
  subDetail: string | null;
  /** Nome normalizado do Estabelecimento/Grupo após motor de agrupamento (ex: 'Uber', 'iFood', 'Amazon') */
  merchantGroup: string;
  /** Categoria atribuída (ex: 'Alimentação & Delivery', 'Transporte & Mobilidade', etc.) */
  category: string;
  /** Classificação de fluxo financeiro */
  flowKind: FlowKind;
  /** Origem da decisão de classificação */
  classificationSource: ClassificationSource;
  /** Nível de confiança da classificação (0 a 100) */
  confidence: number;
  /** Valor original do CSV */
  rawAmount: number;
  /** Impacto no caixa (+ entrada/estorno, - saída/gasto) */
  signedCashflow: number;
  /** Impacto como despesa líquida (+ gasto/IOF, - estorno/desconto, 0 para receita/fatura/investimento) */
  expenseAmount: number;
  /** Impacto como receita (+ entrada real, 0 para demais) */
  incomeAmount: number;
  /** Informações de parcelamento caso detectado */
  installment: InstallmentInfo | null;
  /** Se for IOF ou Estorno, qual o título alvo referido entre aspas */
  linkedTargetTitle: string | null;
  /** Regra que deu match (ou 'manual' / 'semantic-ai') */
  matchedRuleId: string | null;
  /** Notas ou tags customizadas pelo usuário */
  tags?: string[];
  notes?: string;
  /** Ordem original da linha dentro do CSV (0, 1, 2...) para reconstituição exata de saldo em conta */
  csvRowOrder?: number;
}

export interface GroupingRule {
  id: string;
  /** Nome canônico do grupo/estabelecimento (ex: 'Uber', 'iFood', 'Cemig (Energia)') */
  merchantGroup: string;
  /** Categoria associada */
  category: string;
  /** Padrões de busca (case-insensitive substring ou regex simples) que ativam esta regra */
  patterns: string[];
  /** Documentos CPF/CNPJ associados automaticamente a este grupo */
  documentIds?: string[];
  /** Opcional: forçar um FlowKind específico (ex: 'investment', 'income', 'expense') */
  forceFlowKind?: FlowKind;
  /** Se é regra padrão do sistema ou criada/editada/aprendida pelo usuário */
  isCustom?: boolean;
  /** Quantas vezes foi reforçada pelo aprendizado do usuário */
  learnedCount?: number;
  updatedAt?: string;
}

export interface LearnedPatternEntry {
  id: string;
  keyType: 'document' | 'token' | 'prefix';
  keyValue: string;
  merchantGroup: string;
  category: string;
  flowKind?: FlowKind;
  learnedFromSample: string;
  createdAt: string;
  hitCount?: number;
}

export interface SmartSuggestion {
  id: string;
  type: 'merge_candidates' | 'unclassified_cluster' | 'price_change' | 'anomaly';
  title: string;
  description: string;
  confidence: number;
  suggestedMerchantGroup: string;
  suggestedCategory: string;
  patternsToLearn: string[];
  documentIdsToLearn: string[];
  affectedTransactionCount: number;
  totalAmount: number;
}

export interface BehavioralInsight {
  id: string;
  category: 'habit' | 'subscription' | 'anomaly' | 'channel';
  title: string;
  metric: string;
  detail: string;
  severity: 'info' | 'positive' | 'warning';
}

export interface TransactionOverride {
  merchantGroup?: string;
  category?: string;
  flowKind?: FlowKind;
  notes?: string;
  tags?: string[];
}

export type CostTypeOverrideValue =
  | 'digital_subscription'
  | 'fixed_cost'
  | 'variable_recurring'
  | 'one_off';

export interface UserConfigStore {
  rules: GroupingRule[];
  learnedPatterns: LearnedPatternEntry[];
  dismissedSuggestions: string[];
  overrides: Record<string, TransactionOverride>;
  categoryBudgets: Record<string, number>;
  costTypeOverrides?: Record<string, CostTypeOverrideValue>;
  currentBankBalance?: number | null;
}

export interface CsvFileSummary {
  fileName: string;
  source: SourceType;
  rowCount: number;
  minDate: string;
  maxDate: string;
  totalExpenses: number;
  totalIncome: number;
  invoiceDate: string | null;
}
