import type { Category, Item, ItemQuote, Purchase } from '@/types/database';

/**
 * Itens que saíram da lista inicial do enxoval: as compras de mercado, que o
 * casal faz depois da casa montada (ver supabase/migrations/0008).
 *
 * Espaços criados antes disso ainda os têm. Ao abrir, o aplicativo os remove
 * — mas só os originais do catálogo, pelo nome exato dentro da categoria
 * original, e nunca:
 *   · um item criado pelo casal (is_custom), mesmo com o mesmo nome;
 *   · um item com compra registrada ou com cotação — isso é dado de vocês;
 *   · uma categoria que ainda tenha outros itens ou um orçamento definido.
 */
export const RETIRED_CATALOG: Record<string, readonly string[]> = {
  'Produtos de limpeza': [
    'Detergente',
    'Sabão para roupas',
    'Amaciante',
    'Desinfetante',
    'Limpador multiuso',
    'Limpador de banheiro',
    'Água sanitária',
    'Álcool para limpeza, quando apropriado',
    'Sabão em barra',
    'Papel-toalha',
  ],
  'Higiene pessoal': [
    'Escovas de dentes',
    'Sabonetes',
    'Shampoo e condicionador',
    'Desodorantes',
    'Creme dental',
    'Fio dental',
    'Algodão e cotonetes',
    'Produtos pessoais de uso habitual',
    'Medicamentos de uso habitual, se houver',
  ],
  'Primeira compra de supermercado': [
    'Café',
    'Açúcar ou adoçante',
    'Sal',
    'Óleo ou azeite',
    'Arroz',
    'Feijão',
    'Macarrão',
    'Farinha e ingredientes habituais',
    'Temperos básicos',
    'Leite',
    'Ovos',
    'Pão',
    'Manteiga ou margarina',
    'Água potável',
    'Alimentos para as primeiras refeições',
  ],
};

export interface RetirementPlan {
  itemIds: string[];
  categoryIds: string[];
  /** itens de mercado mantidos porque já têm compra ou cotação */
  kept: number;
}

export function planRetirement(data: {
  categories: Category[];
  items: Item[];
  purchases: Purchase[];
  quotes: ItemQuote[];
  budgets: { category_id: string | null }[];
}): RetirementPlan {
  const comCompra = new Set(data.purchases.map((p) => p.item_id).filter(Boolean) as string[]);
  const comCotacao = new Set(data.quotes.map((q) => q.item_id));
  const comOrcamento = new Set(data.budgets.map((b) => b.category_id).filter(Boolean) as string[]);

  const itemIds: string[] = [];
  const categoryIds: string[] = [];
  let kept = 0;

  for (const category of data.categories) {
    const nomes = RETIRED_CATALOG[category.name];
    if (!nomes) continue;
    const doCatalogo = new Set(nomes);
    const daCategoria = data.items.filter((item) => item.category_id === category.id);

    let ficam = 0;
    for (const item of daCategoria) {
      const original = !item.is_custom && doCatalogo.has(item.name);
      const usado =
        comCompra.has(item.id) || comCotacao.has(item.id) || Number(item.qty_bought) > 0;
      if (original && !usado) itemIds.push(item.id);
      else {
        ficam += 1;
        if (original) kept += 1;
      }
    }
    if (ficam === 0 && !comOrcamento.has(category.id)) categoryIds.push(category.id);
  }

  return { itemIds, categoryIds, kept };
}
