import {
  GroupingRule,
  FlowKind,
  TransactionOverride,
  LearnedPatternEntry,
  ClassificationSource,
} from './types.ts';

export const DEFAULT_CATEGORIES = [
  'Alimentação & Delivery',
  'Supermercado & Padaria',
  'Restaurantes & Bares',
  'Transporte & Mobilidade',
  'Moradia & Contas Fixas',
  'Casa, Reforma & Manutenção',
  'Saúde & Farmácia',
  'Assinaturas Digitais & IA',
  'Games & Entretenimento',
  'Compras & E-commerce',
  'Moda, Beleza & Estética',
  'Pets & Veterinária',
  'Viagens & Hospedagem',
  'Serviços & Lavanderia',
  'Transferências & Pessoas',
  'Receitas & Câmbio PJ',
  'Investimentos & Reserva',
  'Fatura & Movimentações Neutras',
  'Outros',
] as const;

export const DEFAULT_GROUPING_RULES: GroupingRule[] = [
  // === TRANSPORTE & MOBILIDADE ===
  {
    id: 'rule-uber',
    merchantGroup: 'Uber',
    category: 'Transporte & Mobilidade',
    patterns: ['Dl*Uberrides', 'Dl *Uberrides', 'Uber Uber *Trip', 'Uber* Trip', 'Uberrides'],
  },
  {
    id: 'rule-99',
    merchantGroup: '99 App',
    category: 'Transporte & Mobilidade',
    patterns: ['99 - NuPay', '99 TECNOLOGIA LTDA', '99*'],
    documentIds: ['18.033.552/0001-61'],
  },

  // === ALIMENTAÇÃO & DELIVERY ===
  {
    id: 'rule-ifood',
    merchantGroup: 'iFood',
    category: 'Alimentação & Delivery',
    patterns: [
      'iFood - NuPay',
      'via NuPay - iFood',
      'Ifd*',
      'IFOOD.COM AGENCIA DE RESTAURANTES',
    ],
    documentIds: ['14.380.200/0001-21'],
  },
  {
    id: 'rule-ze-delivery',
    merchantGroup: 'Zé Delivery (Bebidas)',
    category: 'Alimentação & Delivery',
    patterns: ['Zé Delivery - NuPay', 'Zé Delivery-D7', 'Ze Delivery'],
  },
  {
    id: 'rule-dolce-gusto',
    merchantGroup: 'Nescafé Dolce Gusto',
    category: 'Alimentação & Delivery',
    patterns: ['Nescafe Dolce Gusto'],
  },

  // === RESTAURANTES, LANCHES & BARES ===
  {
    id: 'rule-supremo',
    merchantGroup: 'Restaurante Supremo',
    category: 'Restaurantes & Bares',
    patterns: ['Restaurante Supremo', 'Supremo Sabor'],
  },
  {
    id: 'rule-coco-bambu',
    merchantGroup: 'Coco Bambu',
    category: 'Restaurantes & Bares',
    patterns: ['Coco Bambu'],
  },
  {
    id: 'rule-outback',
    merchantGroup: 'Outback Steakhouse',
    category: 'Restaurantes & Bares',
    patterns: ['Outback'],
  },
  {
    id: 'rule-fastfood-lanches',
    merchantGroup: 'Fast-Food & Lanches (Subway, KFC, Forasteiro, Pizza, Açaí)',
    category: 'Restaurantes & Bares',
    patterns: [
      'Subway',
      'Kfc Shop',
      'Cappta *Forasteiro Bur',
      'Pizzariaefrango',
      'Jah do Acai',
      'Prediletto',
      'Restaurante e Lanchone',
      'Si Senor',
      'Espeteria da Gigi',
      'Borelli',
    ],
  },
  {
    id: 'rule-zigpay',
    merchantGroup: 'Zigpay (Bares & Eventos)',
    category: 'Restaurantes & Bares',
    patterns: ['Zigpay'],
  },

  // === SUPERMERCADO & PADARIA ===
  {
    id: 'rule-mart-minas',
    merchantGroup: 'Mart Minas Atacado',
    category: 'Supermercado & Padaria',
    patterns: ['Mart Minas'],
  },
  {
    id: 'rule-sodiminas',
    merchantGroup: 'Sodiminas Supermercado',
    category: 'Supermercado & Padaria',
    patterns: ['Sodiminas'],
  },
  {
    id: 'rule-supermercados-padarias',
    merchantGroup: 'Supermercados & Padarias (Mix, Pampulha, Boulangerie)',
    category: 'Supermercado & Padaria',
    patterns: [
      'Mix Supermercado',
      'Supermercado e Padaria',
      'Boulangerie',
      'Filial 11 - Pampulha',
      'Pampulha',
    ],
  },

  // === MORADIA & CONTAS FIXAS ===
  {
    id: 'rule-cemig',
    merchantGroup: 'CEMIG (Energia Elétrica)',
    category: 'Moradia & Contas Fixas',
    patterns: ['CEMIG DISTRIBUICAO'],
    documentIds: ['06.981.180/0001-16'],
  },
  {
    id: 'rule-copasa',
    merchantGroup: 'COPASA (Água e Esgoto)',
    category: 'Moradia & Contas Fixas',
    patterns: ['COPASA MG'],
    documentIds: ['17.281.106/0001-03'],
  },
  {
    id: 'rule-claro',
    merchantGroup: 'Claro (Telefonia / Fibra)',
    category: 'Moradia & Contas Fixas',
    patterns: ['CLARO', 'Recarga de celular'],
    documentIds: ['40.432.544/0001-47'],
  },
  {
    id: 'rule-nova-rede',
    merchantGroup: 'Nova Rede Telecomunicações (Internet)',
    category: 'Moradia & Contas Fixas',
    patterns: ['NOVA REDE DE TELECOMUNICACOES'],
    documentIds: ['07.450.765/0001-72'],
  },

  // === CASA, REFORMA & MANUTENÇÃO ===
  {
    id: 'rule-reforma-obra',
    merchantGroup: 'Reforma, Obra & Materiais (Leroy, Calhas, Elétrica, Tintas, Marmoraria)',
    category: 'Casa, Reforma & Manutenção',
    patterns: [
      'Leroy Merlin',
      'CALHAS ATUAL',
      'Mp *Calhasatual',
      'Mp *Eletricaaplic',
      'Mp *Hmtintas',
      'Mp *Marmorarialib',
      'Granvitor Acabamentos',
      'Stb*Gleicecomerciodeel',
      'Casa e Video',
    ],
    documentIds: ['41.425.565/0001-06'],
  },

  // === SAÚDE, ACADEMIA & FARMÁCIA ===
  {
    id: 'rule-unimed',
    merchantGroup: 'Unimed BH (Plano de Saúde)',
    category: 'Saúde & Farmácia',
    patterns: ['UNIMED BH'],
    documentIds: ['16.513.178/0001-76'],
  },
  {
    id: 'rule-araujo',
    merchantGroup: 'Drogaria Araujo',
    category: 'Saúde & Farmácia',
    patterns: [
      'Drogaria Araujo',
      'DROGARIA ARAUJO',
      'Araujo Loja',
      'Araujo Online',
      'Ifd*Drogaria Araujo',
    ],
    documentIds: ['17.256.512/0001-16'],
  },
  {
    id: 'rule-farmacias-outras',
    merchantGroup: 'Outras Farmácias (Raia, Costa de Oliveira, Popular)',
    category: 'Saúde & Farmácia',
    patterns: ['FARMACIA COSTA DE OLIVEIRA', 'Raia3899', 'Drogaria Popular'],
    documentIds: ['24.565.603/0001-07'],
  },
  {
    id: 'rule-clinicas-academia',
    merchantGroup: 'Saúde, Odonto, Clínicas & Academia',
    category: 'Saúde & Farmácia',
    patterns: ['Consultorio Odontologi', 'Dr Bh', 'Academiaarena'],
  },

  // === ASSINATURAS DIGITAIS, IA & CLOUD ===
  {
    id: 'rule-openai',
    merchantGroup: 'OpenAI (ChatGPT Plus / API)',
    category: 'Assinaturas Digitais & IA',
    patterns: ['Openai *Chatgpt', 'Openai* Chatgpt'],
  },
  {
    id: 'rule-anthropic',
    merchantGroup: 'Anthropic (Claude AI)',
    category: 'Assinaturas Digitais & IA',
    patterns: ['Anthropic* Claude'],
  },
  {
    id: 'rule-youtube',
    merchantGroup: 'YouTube Premium',
    category: 'Assinaturas Digitais & IA',
    patterns: ['Google Youtubepremium', 'Dl*Google Youtub'],
  },
  {
    id: 'rule-google-one',
    merchantGroup: 'Google One / Google Services',
    category: 'Assinaturas Digitais & IA',
    patterns: [
      'Google One',
      'Dl *Google Google One',
      'Dl*Google Google',
      'Google G1ai101m',
      'Google Screen Time',
      'GOOGLE BRASIL PAGAMENTOS',
    ],
    documentIds: ['13.382.906/0001-60'],
  },
  {
    id: 'rule-cloud-privacy',
    merchantGroup: 'MEGA & Proton (Cloud / Privacidade)',
    category: 'Assinaturas Digitais & IA',
    patterns: ['Mega Limited', 'Paypal *Proton'],
  },
  {
    id: 'rule-discord',
    merchantGroup: 'Discord Nitro',
    category: 'Assinaturas Digitais & IA',
    patterns: ['Paypal *Discord', 'Discord'],
  },
  {
    id: 'rule-streaming-video',
    merchantGroup: 'Streaming (Netflix, Crunchyroll, WeTV, Prime Video)',
    category: 'Assinaturas Digitais & IA',
    patterns: [
      'Netflix.Com',
      'Ebn*Crunchyro',
      'Ebn *Crunchyroll',
      'Google Wetv',
      'Dl*Google Wetv',
      'Amazonprimebr',
      'Amazon Prime Canais',
      'Amazon Prime Aluguel',
    ],
  },

  // === GAMES & ENTRETENIMENTO ===
  {
    id: 'rule-ccp-games',
    merchantGroup: 'CCP Games (EVE Online)',
    category: 'Games & Entretenimento',
    patterns: ['Paypal *Ccp Games'],
  },
  {
    id: 'rule-steam-pc',
    merchantGroup: 'Steam, Blizzard, NexusMods & PC Gaming',
    category: 'Games & Entretenimento',
    patterns: [
      'Wl *Steam Purchase',
      'Steamgames.Com',
      'Paddle.Net* Nexusmods',
      'Paypal *Quellcrestg',
      'Blizzard WoW',
      'Nitrado Usa',
    ],
  },
  {
    id: 'rule-ingresso-cinema',
    merchantGroup: 'Ingresso.com (Cinema & Eventos)',
    category: 'Games & Entretenimento',
    patterns: ['Ingresso.com'],
  },
  {
    id: 'rule-apps-online',
    merchantGroup: 'Google Superlive & Serviços Digitais',
    category: 'Games & Entretenimento',
    patterns: [
      'Google Superlive',
      'Dm*Dlmspy',
      'Dm*Bizbox',
      'Dm*Upsurf',
      'Relaxspirit.Click',
      'Bodyrelax.Click',
      'SKOWSAND TECNOLOGIA',
      'XEMPIRE',
      'QMS INTERNACIONAL',
    ],
  },

  // === COMPRAS & E-COMMERCE ===
  {
    id: 'rule-amazon',
    merchantGroup: 'Amazon Brasil',
    category: 'Compras & E-commerce',
    patterns: ['Amazonmktplc*', 'Amazon Credito - NuPay', 'Amazon'],
  },
  {
    id: 'rule-shopee-mp',
    merchantGroup: 'Shopee, Mercado Pago & Pagadores Online',
    category: 'Compras & E-commerce',
    patterns: [
      'SHPP BRASIL',
      'PIX Marketplace',
      'TRANZIO INTERMEDIACOES',
      'Pagar Me Pagamentos',
    ],
  },
  {
    id: 'rule-varejo-shopping',
    merchantGroup: 'Shopping & Varejo (Daiso, Americanas, Leitura, Boulevard)',
    category: 'Compras & E-commerce',
    patterns: [
      'Daiso Brasil',
      'DAISO BRASIL',
      'Lojas Americanas',
      'Leituraboulevard',
      'Boulevard Belo Horizon',
    ],
    documentIds: ['14.987.685/0001-16'],
  },

  // === MODA, BELEZA & ESTÉTICA ===
  {
    id: 'rule-moda-mundial',
    merchantGroup: 'Moda Mundial Brasil (Shein / Internacional)',
    category: 'Moda, Beleza & Estética',
    patterns: ['Moda Mundial Brasil', 'MODA MUNDIAL BRASIL'],
    documentIds: ['50.617.696/0001-78'],
  },
  {
    id: 'rule-beleza-perfumaria',
    merchantGroup: 'Beleza, Perfumaria & Vestuário (Sephora, Lojas Rede, Geneve, YesStyle)',
    category: 'Moda, Beleza & Estética',
    patterns: [
      'Sephora',
      'Geneve Parfum',
      'Lojas Rede',
      'Mundo do Cabeleireiro',
      'Yesstyle.Com',
      'Ponto da Lingerie',
      'CLAUDIA SIMOES NOIVAS',
    ],
  },

  // === PETS & VETERINÁRIA ===
  {
    id: 'rule-pets',
    merchantGroup: 'Animal Pet & Petshop',
    category: 'Pets & Veterinária',
    patterns: ['Animal Pet', 'ANIMAL PET', 'Mp *Amigocao', 'Petiscos da Deia'],
  },

  // === VIAGENS & HOSPEDAGEM ===
  {
    id: 'rule-viagens',
    merchantGroup: 'Passagens Aéreas & Agência de Turismo',
    category: 'Viagens & Hospedagem',
    patterns: ['Cias Aereas', 'IINOVI AGENCIA DE VIAGENS'],
    documentIds: ['19.138.279/0001-00'],
  },

  // === SERVIÇOS & LAVANDERIA ===
  {
    id: 'rule-lavanderia',
    merchantGroup: 'Lavanderia (LavaTudoVIP / Lavanderia Lj)',
    category: 'Serviços & Lavanderia',
    patterns: ['Lavatudovip', 'Lavanderia Lj'],
  },

  // === RECEITAS & CÂMBIO PJ ===
  {
    id: 'rule-wise',
    merchantGroup: 'Wise Brasil (Câmbio / Exterior)',
    category: 'Receitas & Câmbio PJ',
    patterns: ['Wise Brasil Corretora', 'Wise Brasil Instituicao'],
    documentIds: ['36.588.217/0001-01', '40.571.694/0001-31'],
  },
  {
    id: 'rule-receita-federal',
    merchantGroup: 'Receita Federal (Restituição IRPF)',
    category: 'Receitas & Câmbio PJ',
    patterns: ['SECR. DA RECEITA FEDERAL'],
    forceFlowKind: 'income',
  },

  // === INVESTIMENTOS & RESERVA ===
  {
    id: 'rule-rdb-cdb',
    merchantGroup: 'Nubank RDB / CDB (Reserva)',
    category: 'Investimentos & Reserva',
    patterns: ['Aplicação RDB', 'Resgate RDB', 'Aplicação CDB'],
    forceFlowKind: 'investment',
  },

  // === FATURA & MOVIMENTAÇÕES NEUTRAS ===
  {
    id: 'rule-fatura',
    merchantGroup: 'Pagamento de Fatura Nubank',
    category: 'Fatura & Movimentações Neutras',
    patterns: ['Pagamento de fatura', 'Pagamento recebido'],
    forceFlowKind: 'cc_payment',
  },
];

export interface MatchResult {
  merchantGroup: string;
  category: string;
  matchedRuleId: string | null;
  forcedFlowKind?: FlowKind;
  subDetail: string | null;
  classificationSource: ClassificationSource;
  confidence: number;
  gateway: string | null;
}

/**
 * Normalizes strings for comparison (removes accents and lowercases)
 */
export function normalizeForMatch(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Extracts CPF (•••.XXX.XXX-••) or CNPJ (XX.XXX.XXX/XXXX-XX) from bank descriptions
 */
export function extractDocumentId(text: string): string | null {
  const cnpjMatch = text.match(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/);
  if (cnpjMatch) return cnpjMatch[0];

  const cpfMatch = text.match(/[•*]{3}\.\d{3}\.\d{3}-[•*]{2}/);
  if (cpfMatch) return cpfMatch[0];

  return null;
}

/**
 * Unpacks payment gateway prefixes on credit card & bank descriptions
 * e.g. "Mp *Calhasatual" -> { gateway: "Mercado Pago", cleanName: "Calhasatual" }
 */
export function extractGatewayAndCleanName(rawText: string): {
  gateway: string | null;
  cleanName: string;
  subDetail: string | null;
} {
  const gatewayPrefixes: Array<{ regex: RegExp; gateway: string; detailPrefix?: string }> = [
    { regex: /^Ifd\*\s*(.+)$/i, gateway: 'iFood', detailPrefix: 'Restaurante via iFood' },
    { regex: /^Amazonmktplc\*\s*(.+)$/i, gateway: 'Amazon Marketplace', detailPrefix: 'Vendedor Marketplace' },
    { regex: /^Dl\s*\*\s*(.+)$/i, gateway: 'DLocal', detailPrefix: 'Processado via DLocal' },
    { regex: /^Mp\s*\*\s*(.+)$/i, gateway: 'Mercado Pago', detailPrefix: 'Via Mercado Pago' },
    { regex: /^Ebn\s*\*\s*(.+)$/i, gateway: 'EBANX', detailPrefix: 'Via EBANX' },
    { regex: /^Pagprim\s*\*\s*(.+)$/i, gateway: 'PagPrime', detailPrefix: 'Via PagPrime' },
    { regex: /^Cappta\s*\*\s*(.+)$/i, gateway: 'Cappta', detailPrefix: 'Maquininha Cappta' },
    { regex: /^Stb\s*\*\s*(.+)$/i, gateway: 'Stone', detailPrefix: 'Maquininha Stone' },
    { regex: /^Wl\s*\*\s*(.+)$/i, gateway: 'Worldline', detailPrefix: 'Via Worldline' },
    { regex: /^Dm\s*\*\s*(.+)$/i, gateway: 'Digital Matter', detailPrefix: 'Cobrança Internacional DM' },
    { regex: /^Paypal\s*\*\s*(.+)$/i, gateway: 'PayPal', detailPrefix: 'Via PayPal' },
    { regex: /^Paddle\.Net\s*\*\s*(.+)$/i, gateway: 'Paddle', detailPrefix: 'Via Paddle.net' },
  ];

  for (const gp of gatewayPrefixes) {
    const m = rawText.match(gp.regex);
    if (m) {
      const cleanName = m[1].trim();
      return {
        gateway: gp.gateway,
        cleanName,
        subDetail: gp.detailPrefix ? `${gp.detailPrefix}: ${cleanName}` : null,
      };
    }
  }

  return { gateway: null, cleanName: rawText.trim(), subDetail: null };
}

/**
 * Generates a normalized token key for pattern learning
 */
export function buildNormalizedTokenKey(text: string): string {
  const { cleanName } = extractGatewayAndCleanName(text);
  return normalizeForMatch(cleanName)
    .replace(/\b(ltda|s\/a|s\.a|me|ip|nupay|pagamentos|comercio|brasil)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Semantic AI Keyword Classifier for unknown future CSV merchants
 */
const SEMANTIC_SECTOR_DICTIONARY: Array<{
  category: string;
  keywords: string[];
}> = [
  {
    category: 'Restaurantes & Bares',
    keywords: [
      'restaurante', 'lanchone', 'burger', 'hamburguer', 'pizza', 'pizzaria',
      'sushi', 'bar ', 'espeteria', 'churrasco', 'acai', 'sorvete', 'gelato',
      'bistro', 'grill', 'steak', 'outback', 'bambu', 'kfc', 'subway', 'mcdonald',
      'bk ', 'boteco', 'pub', 'cervejaria', 'cafeteria', 'cafe',
    ],
  },
  {
    category: 'Alimentação & Delivery',
    keywords: ['ifood', 'ze delivery', 'rappi', 'aiqfome', 'delivery', 'dolce gusto'],
  },
  {
    category: 'Supermercado & Padaria',
    keywords: [
      'supermercado', 'atacado', 'atacadista', 'mart ', 'sodiminas', 'padaria',
      'panificadora', 'boulangerie', 'hortifruti', 'sacolao', 'acougue', 'carrefour',
      'epa ', 'super nosso', 'verdemar', 'bh supermercados',
    ],
  },
  {
    category: 'Saúde & Farmácia',
    keywords: [
      'drogaria', 'farmacia', 'araujo', 'raia', 'droga', 'pacheco', 'pague menos',
      'unimed', 'med ', 'medico', 'clinica', 'hospital', 'laboratorio', 'hermes pardini',
      'odonto', 'dentista', 'psicolog', 'fisioterap', 'academia', 'smartfit', 'arena',
    ],
  },
  {
    category: 'Transporte & Mobilidade',
    keywords: [
      'uber', '99 ', 'cabify', 'taxi', 'posto', 'combustivel', 'gasolina', 'ipiranga',
      'shell', 'petrobras', 'estacionamento', 'park', 'pedagio', 'sem parar', 'veloe',
      'automoveis', 'oficina', 'mecanica', 'pneus', 'autoescola',
    ],
  },
  {
    category: 'Casa, Reforma & Manutenção',
    keywords: [
      'leroy', 'telhanorte', 'tintas', 'eletrica', 'hidraulica', 'marmoraria',
      'acabamentos', 'calhas', 'ferragens', 'construcao', 'marceneiro', 'vidracaria',
      'casa e video', 'tok stok',
    ],
  },
  {
    category: 'Moda, Beleza & Estética',
    keywords: [
      'sephora', 'parfum', 'perfumaria', 'cosmeticos', 'lojas rede', 'cabeleireiro',
      'salao', 'barbearia', 'estetica', 'moda', 'roupas', 'calcados', 'renner',
      'riachuelo', 'cea', 'zara', 'shein', 'yesstyle', 'lingerie', 'noivas',
    ],
  },
  {
    category: 'Pets & Veterinária',
    keywords: ['pet', 'petshop', 'vet', 'veterinari', 'amigocao', 'cobasi', 'petz', 'racao'],
  },
  {
    category: 'Viagens & Hospedagem',
    keywords: [
      'cias aereas', 'latam', 'azul', 'gol ', 'decolar', 'booking', 'airbnb',
      'hotel', 'pousada', 'viagens', 'turismo', 'agencia de viagens', 'buser',
    ],
  },
  {
    category: 'Assinaturas Digitais & IA',
    keywords: [
      'openai', 'chatgpt', 'anthropic', 'claude', 'cursor', 'github', 'copilot',
      'google one', 'youtubepremium', 'netflix', 'spotify', 'amazonprime',
      'crunchyroll', 'wetv', 'disney', 'hbo', 'max', 'apple.com/bill', 'proton',
      'mega limited', 'discord',
    ],
  },
  {
    category: 'Games & Entretenimento',
    keywords: [
      'steam', 'ccp games', 'blizzard', 'riot', 'epic games', 'playstation',
      'xbox', 'nintendo', 'nexusmods', 'nitrado', 'ingresso', 'cinema', 'sympla',
    ],
  },
  {
    category: 'Moradia & Contas Fixas',
    keywords: [
      'cemig', 'copasa', 'claro', 'vivo', 'tim ', 'oi ', 'telecom', 'internet',
      'condominio', 'aluguel', 'iptu', 'gas ',
    ],
  },
  {
    category: 'Serviços & Lavanderia',
    keywords: ['lavanderia', 'lavatudo', 'cartorio', 'correios', 'advocacia', 'contabilidade'],
  },
];

export function inferSemanticCategory(text: string, source: 'bankAccount' | 'creditCard'): {
  category: string;
  confidence: number;
} {
  const norm = normalizeForMatch(text);
  for (const sector of SEMANTIC_SECTOR_DICTIONARY) {
    for (const kw of sector.keywords) {
      if (norm.includes(normalizeForMatch(kw))) {
        return { category: sector.category, confidence: 84 };
      }
    }
  }
  return {
    category: source === 'creditCard' ? 'Compras & E-commerce' : 'Transferências & Pessoas',
    confidence: 55,
  };
}

export function matchGroupingRule(
  targetText: string,
  extractedCounterparty: string,
  rules: GroupingRule[],
  overrides: Record<string, TransactionOverride>,
  txId: string,
  documentId: string | null = null,
  learnedPatterns: LearnedPatternEntry[] = [],
  source: 'bankAccount' | 'creditCard' = 'creditCard'
): MatchResult {
  const { gateway, cleanName, subDetail } = extractGatewayAndCleanName(targetText);
  const override = overrides[txId];

  // 1. Explicit Manual Override on this specific transaction ID
  if (override && (override.merchantGroup || override.category)) {
    return {
      merchantGroup: override.merchantGroup || formatTitleCase(cleanName),
      category: override.category || 'Outros',
      matchedRuleId: 'manual-override',
      forcedFlowKind: override.flowKind,
      subDetail,
      classificationSource: 'manual-override',
      confidence: 100,
      gateway,
    };
  }

  // 2. Learned Pattern by Document ID (CPF/CNPJ) - 99% confidence
  if (documentId) {
    const learnedDoc = learnedPatterns.find(
      (lp) => lp.keyType === 'document' && lp.keyValue === documentId
    );
    if (learnedDoc) {
      return {
        merchantGroup: learnedDoc.merchantGroup,
        category: learnedDoc.category,
        matchedRuleId: learnedDoc.id,
        forcedFlowKind: learnedDoc.flowKind,
        subDetail,
        classificationSource: 'learned-document',
        confidence: 99,
        gateway,
      };
    }

    // Also check if any rule has this documentId
    const ruleByDoc = rules.find((r) => r.documentIds?.includes(documentId));
    if (ruleByDoc) {
      return {
        merchantGroup: ruleByDoc.merchantGroup,
        category: ruleByDoc.category,
        matchedRuleId: ruleByDoc.id,
        forcedFlowKind: ruleByDoc.forceFlowKind,
        subDetail,
        classificationSource: ruleByDoc.isCustom ? 'custom-rule' : 'system-rule',
        confidence: 99,
        gateway,
      };
    }
  }

  // 3. Learned Pattern by Normalized Token Key
  const tokenKey = buildNormalizedTokenKey(extractedCounterparty || targetText);
  if (tokenKey.length >= 3) {
    const learnedToken = learnedPatterns.find(
      (lp) =>
        lp.keyType === 'token' &&
        (lp.keyValue === tokenKey || tokenKey.includes(lp.keyValue))
    );
    if (learnedToken) {
      return {
        merchantGroup: learnedToken.merchantGroup,
        category: learnedToken.category,
        matchedRuleId: learnedToken.id,
        forcedFlowKind: learnedToken.flowKind,
        subDetail,
        classificationSource: 'learned-pattern',
        confidence: 96,
        gateway,
      };
    }
  }

  // 4. Custom & System Grouping Rules
  const normTarget = normalizeForMatch(targetText);
  const normCounterparty = normalizeForMatch(extractedCounterparty);
  const normClean = normalizeForMatch(cleanName);

  const orderedRules = [
    ...rules.filter((r) => r.isCustom),
    ...rules.filter((r) => !r.isCustom),
  ];

  for (const rule of orderedRules) {
    for (const rawPattern of rule.patterns) {
      if (!rawPattern.trim()) continue;
      const cleanPattern = normalizeForMatch(rawPattern.replace(/\*$/g, ''));
      if (
        normTarget.includes(cleanPattern) ||
        normCounterparty.includes(cleanPattern) ||
        normClean.includes(cleanPattern)
      ) {
        return {
          merchantGroup: rule.merchantGroup,
          category: rule.category,
          matchedRuleId: rule.id,
          forcedFlowKind: rule.forceFlowKind,
          subDetail,
          classificationSource: rule.isCustom ? 'custom-rule' : 'system-rule',
          confidence: 95,
          gateway,
        };
      }
    }
  }

  // 5. Semantic AI Sector Classifier for brand-new merchants
  const semantic = inferSemanticCategory(`${targetText} ${extractedCounterparty}`, source);
  return {
    merchantGroup: formatTitleCase(gateway ? cleanName : extractedCounterparty),
    category: semantic.category,
    matchedRuleId: null,
    subDetail,
    classificationSource: semantic.confidence > 70 ? 'semantic-ai' : 'fallback',
    confidence: semantic.confidence,
    gateway,
  };
}

export function formatTitleCase(text: string): string {
  if (!text) return 'Outros';
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= 3) return cleaned.toUpperCase();
  return cleaned
    .toLowerCase()
    .split(' ')
    .map((word, idx) => {
      if (['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'para', 'via'].includes(word) && idx > 0) {
        return word;
      }
      if (['ltda', 's/a', 's.a', 'me', 'ip', 'bh', 'mg', 'cpf', 'cnpj'].includes(word)) {
        return word.toUpperCase();
      }
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}
