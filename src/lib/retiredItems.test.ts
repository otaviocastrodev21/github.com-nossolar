import { describe, expect, it } from 'vitest';
import { planRetirement, RETIRED_CATALOG } from './retiredItems';
import type { Category, Item, ItemQuote, Purchase } from '@/types/database';

const categoria = (id: string, name: string) => ({ id, name }) as Category;
const item = (id: string, category_id: string, name: string, extra: Partial<Item> = {}) =>
  ({ id, category_id, name, is_custom: false, qty_bought: 0, ...extra }) as Item;

const base = () => ({
  categories: [
    categoria('cat-n', 'Primeira compra de supermercado'),
    categoria('cat-g', 'Produtos de limpeza'),
    categoria('cat-a', 'Quarto do casal'),
  ],
  items: [
    item('arroz', 'cat-n', 'Arroz'),
    item('cafe', 'cat-n', 'Café'),
    item('detergente', 'cat-g', 'Detergente'),
    item('cama', 'cat-a', 'Cama de casal ou queen'),
  ],
  purchases: [] as Purchase[],
  quotes: [] as ItemQuote[],
  budgets: [] as { category_id: string | null }[],
});

describe('planRetirement', () => {
  it('tira os itens de mercado do catálogo e as categorias que ficam vazias', () => {
    const plano = planRetirement(base());
    expect(plano.itemIds.sort()).toEqual(['arroz', 'cafe', 'detergente']);
    expect(plano.categoryIds.sort()).toEqual(['cat-g', 'cat-n']);
    expect(plano.kept).toBe(0);
  });

  it('nunca toca no que não é de mercado', () => {
    const plano = planRetirement(base());
    expect(plano.itemIds).not.toContain('cama');
    expect(plano.categoryIds).not.toContain('cat-a');
  });

  it('mantém item com compra registrada, com cotação ou com quantidade comprada', () => {
    const dados = base();
    dados.purchases = [{ item_id: 'arroz' } as Purchase];
    dados.quotes = [{ item_id: 'cafe' } as ItemQuote];
    dados.items.push(item('sal', 'cat-n', 'Sal', { qty_bought: 1 }));
    const plano = planRetirement(dados);
    expect(plano.itemIds).toEqual(['detergente']);
    expect(plano.kept).toBe(3);
    expect(plano.categoryIds).toEqual(['cat-g']); // a de supermercado ainda tem itens
  });

  it('mantém item criado pelo casal, mesmo com o nome igual ao do catálogo', () => {
    const dados = base();
    dados.items.push(item('meu-cafe', 'cat-n', 'Café', { is_custom: true }));
    dados.items.push(item('vinho', 'cat-n', 'Vinho para a inauguração'));
    const plano = planRetirement(dados);
    expect(plano.itemIds).not.toContain('meu-cafe');
    expect(plano.itemIds).not.toContain('vinho');
    expect(plano.categoryIds).not.toContain('cat-n');
  });

  it('não apaga categoria com orçamento definido', () => {
    const dados = base();
    dados.budgets = [{ category_id: 'cat-g' }];
    expect(planRetirement(dados).categoryIds).toEqual(['cat-n']);
  });

  it('o item original só sai da sua categoria original', () => {
    const dados = base();
    dados.items = [item('arroz-movido', 'cat-a', 'Arroz')];
    expect(planRetirement(dados).itemIds).toEqual([]);
  });

  it('cobre as 3 categorias e os 34 itens que saíram', () => {
    expect(Object.keys(RETIRED_CATALOG)).toHaveLength(3);
    expect(Object.values(RETIRED_CATALOG).flat()).toHaveLength(34);
  });
});
