export function formatBRL(value: number, showSign = false): string {
  const abs = Math.abs(value);
  const formatted = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(abs);

  if (value < 0) return `- ${formatted}`;
  if (showSign && value > 0) return `+ ${formatted}`;
  return formatted;
}

export function formatCompactBRL(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1000) {
    return `${value < 0 ? '-' : ''}R$ ${(abs / 1000).toLocaleString('pt-BR', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })}k`;
  }
  return formatBRL(value);
}

export function formatDateBR(isoDate: string | null | undefined): string {
  if (!isoDate || isoDate.length < 10) return isoDate || '-';
  const [yyyy, mm, dd] = isoDate.slice(0, 10).split('-');
  return `${dd}/${mm}/${yyyy}`;
}

const MONTH_NAMES_SHORT = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
];

const MONTH_NAMES_FULL = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

export function formatMonthShort(yyyyMm: string): string {
  if (!yyyyMm || !yyyyMm.includes('-')) return yyyyMm;
  const [yyyy, mm] = yyyyMm.split('-');
  const idx = Number.parseInt(mm, 10) - 1;
  return `${MONTH_NAMES_SHORT[idx] || mm}/${yyyy.slice(2)}`;
}

export function formatMonthFull(yyyyMm: string): string {
  if (!yyyyMm || !yyyyMm.includes('-')) return yyyyMm;
  const [yyyy, mm] = yyyyMm.split('-');
  const idx = Number.parseInt(mm, 10) - 1;
  return `${MONTH_NAMES_FULL[idx] || mm} de ${yyyy}`;
}

export const CATEGORY_COLORS: Record<string, string> = {
  'Alimentação & Delivery': '#f97316',      // orange-500
  'Supermercado & Padaria': '#eab308',      // yellow-500
  'Restaurantes & Bares': '#ec4899',        // pink-500
  'Transporte & Mobilidade': '#3b82f6',     // blue-500
  'Moradia & Contas Fixas': '#06b6d4',      // cyan-500
  'Casa, Reforma & Manutenção': '#f59e0b',  // amber-500
  'Saúde & Farmácia': '#10b981',            // emerald-500
  'Assinaturas Digitais & IA': '#8b5cf6',   // violet-500
  'Games & Entretenimento': '#a855f7',      // purple-500
  'Compras & E-commerce': '#f43f5e',        // rose-500
  'Moda, Beleza & Estética': '#d946ef',     // fuchsia-500
  'Moda & Vestuário': '#d946ef',            // fuchsia-500
  'Pets & Veterinária': '#14b8a6',          // teal-500
  'Viagens & Hospedagem': '#0ea5e9',        // sky-500
  'Serviços & Lavanderia': '#6366f1',       // indigo-500
  'Transferências & Pessoas': '#64748b',    // slate-500
  'Receitas & Câmbio PJ': '#22c55e',        // green-500
  'Investimentos & Reserva': '#38bdf8',     // lightBlue-400
  'Fatura & Movimentações Neutras': '#475569',
  'Outros': '#94a3b8',
};

export function getCategoryColor(category: string): string {
  return CATEGORY_COLORS[category] || '#8b5cf6';
}
