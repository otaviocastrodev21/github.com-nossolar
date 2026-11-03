/**
 * Tokens de visualização de dados.
 *
 * Um único matiz (o verde-oliva da marca, #7D8467) em rampa ordinal, validada
 * contra a superfície dos cards (#F7F6F2):
 *   · lightness monótona           PASS
 *   · ΔL adjacente >= 0.06          PASS
 *   · ponta clara 2,44:1 na superfície  PASS
 *   · matiz único (spread 1°)      PASS
 *
 * Por que um matiz só: as categorias do enxoval são nominais (não há ordem
 * natural entre "Banheiro" e "Cozinha") e são 14 — muito acima do teto de 8
 * cores categóricas. Comprimento de barra já codifica a magnitude, então gastar
 * matiz nisso seria redundante. As cores de status são uma escala fixa e
 * reservada, sempre acompanhadas de ícone + rótulo.
 */

import type { ItemStatus } from '@/types/database';

/**
 * Os valores são variáveis CSS (definidas em index.css para os dois temas):
 * o SVG do Recharts e os estilos em linha as resolvem na hora, então trocar o
 * tema repinta os gráficos sem renderizar nada de novo. A validação acima vale
 * para o tema claro; no escuro a rampa é invertida (mais comprado = mais claro).
 */
export const VIZ = {
  surface: 'var(--viz-surface)',
  hairline: 'var(--viz-hairline)',

  textPrimary: 'var(--viz-text-primary)',
  textSecondary: 'var(--viz-text-secondary)',
  textMuted: 'var(--viz-text-muted)',

  /** série principal das barras — 3,81:1 na superfície */
  series: 'var(--series)',
  /** linha de evolução — 5,80:1 */
  seriesLine: 'var(--series-line)',
  /** área sob a linha: o matiz a ~16% */
  seriesWash: 'var(--series-wash)',
  /** trilha das barras de progresso: passo mais claro da mesma rampa */
  track: 'var(--track)',
  /** referência de orçamento (neutro, nunca compete com a série) */
  reference: 'var(--reference)',
  /** estimado (passo claro da rampa) */
  estimate: 'var(--step-estimado)',

  status: {
    good: '#0CA30C',
    warning: '#FAB219',
    serious: '#EC835A',
    critical: '#D03B3B',
  },
} as const;

/** Rampa ordinal do progresso do item: pendente -> parcial -> comprado. */
export const STATUS_FILL: Record<ItemStatus, string> = {
  pendente: 'var(--step-pendente)',
  parcial: 'var(--step-parcial)',
  comprado: 'var(--step-comprado)',
  nao_sera_comprado: 'var(--step-excluido)',
};

/**
 * Classes Tailwind das etiquetas de status.
 * O texto usa tinta, nunca a cor do dado — a identidade vem do ponto colorido.
 */
export const STATUS_CHIP: Record<ItemStatus, string> = {
  pendente: 'bg-greige-100 text-ink-secondary border-greige-300',
  parcial: 'bg-olive-100 text-olive-700 border-olive-300',
  comprado: 'bg-olive-200 text-olive-800 border-olive-400',
  nao_sera_comprado: 'bg-cream-300 text-ink-muted border-greige-300 line-through decoration-1',
};

export const PRIORITY_CHIP = {
  essencial: 'bg-wood-100 text-wood-600 border-wood-300',
  importante: 'bg-cream-300 text-ink-secondary border-greige-300',
  opcional: 'bg-cream-200 text-ink-muted border-greige-200',
} as const;

/** Nível de uso do orçamento -> cor de status + rótulo (sempre com ícone). */
export function budgetLevel(usage: number | null): {
  level: 'ok' | 'atencao' | 'estourado' | null;
  color: string;
  label: string;
} {
  if (usage === null) return { level: null, color: VIZ.textMuted, label: 'Sem orçamento' };
  if (usage >= 1)
    return { level: 'estourado', color: VIZ.status.critical, label: 'Orçamento estourado' };
  if (usage >= 0.8)
    return { level: 'atencao', color: VIZ.status.warning, label: 'Perto do limite' };
  return { level: 'ok', color: VIZ.series, label: 'Dentro do orçamento' };
}
