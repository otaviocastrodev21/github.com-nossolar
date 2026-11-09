import { catalog, PRIORITY_MAP } from '../../supabase/catalog.mjs';
import type { Category, Item } from '@/types/database';

/**
 * A lista "Primeira compra" (supermercado, limpeza e higiene) chegou a ser
 * retirada do enxoval, e o aplicativo apagou essas categorias dos espaços.
 * Depois o casal pediu de volta — como lista separada, com porcentagem
 * própria. Este plano devolve ao espaço as categorias da primeira compra que
 * não existem nele, com os itens originais do catálogo.
 *
 * Só recria a categoria que está ausente por inteiro. Se ela existe, o casal
 * pode ter apagado alguns itens de propósito, e nada é tocado. A unicidade
 * (espaço, código) do banco impede duplicar quando dois aparelhos abrem ao
 * mesmo tempo.
 */
export const FIRST_PURCHASE_CODES = ['G', 'M', 'N'] as const;

export interface RestoreCategory {
  code: string;
  name: string;
  icon: string;
  sort_order: number;
  items: Pick<
    Item,
    | 'name'
    | 'subcategory'
    | 'unit'
    | 'qty_needed'
    | 'priority'
    | 'conditional'
    | 'allow_fraction'
    | 'qty_open'
    | 'notes'
    | 'sort_order'
  >[];
}

export function planFirstPurchaseRestore(categories: readonly Pick<Category, 'code'>[]): RestoreCategory[] {
  const existentes = new Set(categories.map((c) => c.code.trim().toUpperCase()));
  const plano: RestoreCategory[] = [];

  catalog.forEach((categoria, indice) => {
    if (!(FIRST_PURCHASE_CODES as readonly string[]).includes(categoria.code)) return;
    if (existentes.has(categoria.code)) return;
    plano.push({
      code: categoria.code,
      name: categoria.name,
      icon: categoria.icon,
      // mesma posição do catálogo (o espaço foi criado com essa ordem)
      sort_order: indice + 1,
      items: categoria.items.map((item, ordem) => {
        const mapa = PRIORITY_MAP[item.prio];
        return {
          name: item.name,
          subcategory: item.sub,
          unit: item.unit as Item['unit'],
          qty_needed: item.qty,
          priority: mapa.priority,
          conditional: mapa.conditional,
          allow_fraction: Boolean(item.frac),
          qty_open: Boolean(item.qtyOpen),
          notes: [item.note, mapa.note].filter(Boolean).join(' ') || null,
          sort_order: ordem + 1,
        };
      }),
    });
  });

  return plano;
}
