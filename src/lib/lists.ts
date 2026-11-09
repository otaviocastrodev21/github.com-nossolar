import type { Category, Item } from '@/types/database';

/**
 * As três listas do Nosso Lar. Cada categoria pertence a uma delas, e cada
 * lista tem a própria contagem e a própria porcentagem:
 *
 *   · itens      — o enxoval: o que a casa precisa para funcionar.
 *   · pc         — Primeira compra: supermercado, limpeza e higiene, a
 *                  primeira ida ao mercado com a casa montada.
 *   · construcao — Materiais de construção: ferramentas, medição (trena,
 *                  nível), fixação, elétrica e primeiros socorros.
 *
 * A lista vem do código da categoria, que é o mesmo do catálogo em todos os
 * espaços e não muda quando o casal renomeia a categoria. Categoria criada
 * pelo casal entra no enxoval.
 */
export type ListKey = 'itens' | 'pc' | 'construcao';

export interface ListInfo {
  key: ListKey;
  /** nome da aba do checklist */
  label: string;
  /** rótulo curto, para a barra lateral */
  short: string;
}

export const LISTS: readonly ListInfo[] = [
  { key: 'itens', label: 'Checklist itens', short: 'Enxoval' },
  { key: 'pc', label: 'Checklist P.C', short: 'Primeira compra' },
  { key: 'construcao', label: 'Materiais de construção', short: 'Materiais de construção' },
];

export const LIST_BY_KEY = Object.fromEntries(LISTS.map((l) => [l.key, l])) as Record<ListKey, ListInfo>;

/** Código da categoria no catálogo → lista. */
const LISTA_DO_CODIGO: Record<string, ListKey> = {
  G: 'pc', // Produtos de limpeza
  M: 'pc', // Higiene pessoal
  N: 'pc', // Primeira compra de supermercado
  K: 'construcao', // Ferramentas e manutenção
};

export function listOfCategory(category: Pick<Category, 'code'> | null | undefined): ListKey {
  return LISTA_DO_CODIGO[(category?.code ?? '').trim().toUpperCase()] ?? 'itens';
}

export function isListKey(value: string | null | undefined): value is ListKey {
  return value === 'itens' || value === 'pc' || value === 'construcao';
}

/**
 * Entra na contagem e na porcentagem? Só produto que o casal de fato vai
 * comprar: tarefa de verificação não é compra, "não será comprado" saiu do
 * plano, e item opcional é desejo, não necessidade. Os três continuam
 * visíveis no checklist — só não contam.
 */
export const countsInProgress = (
  item: Pick<Item, 'is_task' | 'excluded' | 'priority'>,
): boolean => !item.is_task && !item.excluded && item.priority !== 'opcional';
