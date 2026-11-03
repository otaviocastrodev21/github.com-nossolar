import { describe, expect, it } from 'vitest';
import { compareQuotes, normalizeUrl, quoteTotal, storeFromUrl } from './quotes';
import type { ItemQuote } from '@/types/database';

let n = 0;
const cotacao = (store: string, price: number, shipping = 0): ItemQuote => ({
  id: `q${++n}`,
  space_id: 's',
  item_id: 'i',
  store,
  price,
  shipping,
  url: null,
  notes: null,
  created_by: null,
  created_at: `2026-11-03T10:00:${String(n).padStart(2, '0')}Z`,
  updated_at: `2026-11-03T10:00:${String(n).padStart(2, '0')}Z`,
});

describe('compareQuotes', () => {
  it('aponta o mais barato e quanto ele economiza frente ao segundo', () => {
    const r = compareQuotes([cotacao('Site 1', 450), cotacao('Site 2', 430)]);
    expect(r.best?.store).toBe('Site 2');
    expect(r.runnerUp?.store).toBe('Site 1');
    expect(r.saving).toBe(20);
    expect(r.savingRatio).toBeCloseTo(20 / 450, 6);
    expect(r.tie).toBe(false);
  });

  it('compara pelo preço final: o frete pode inverter quem é mais barato', () => {
    const r = compareQuotes([cotacao('Barato com frete', 400, 60), cotacao('Frete grátis', 440)]);
    expect(r.best?.store).toBe('Frete grátis');
    expect(r.saving).toBe(20);
    expect(quoteTotal(r.ranked[1])).toBe(460);
  });

  it('ordena todas e mede a distância entre a mais barata e a mais cara', () => {
    const r = compareQuotes([cotacao('B', 99.9), cotacao('C', 120), cotacao('A', 89.9)]);
    expect(r.ranked.map((q) => q.store)).toEqual(['A', 'B', 'C']);
    expect(r.worst?.store).toBe('C');
    expect(r.spread).toBe(30.1);
  });

  it('reconhece empate e não inventa economia', () => {
    const r = compareQuotes([cotacao('X', 100), cotacao('Y', 100)]);
    expect(r.tie).toBe(true);
    expect(r.saving).toBe(0);
    expect(r.best?.store).toBe('X'); // a cadastrada antes
  });

  it('com uma cotação só não há com quem comparar', () => {
    const r = compareQuotes([cotacao('Única', 250)]);
    expect(r.best?.store).toBe('Única');
    expect(r.runnerUp).toBeNull();
    expect(r.saving).toBe(0);
    expect(compareQuotes([]).best).toBeNull();
  });
});

describe('storeFromUrl', () => {
  it('dá o nome das lojas conhecidas', () => {
    expect(storeFromUrl('https://www.tokstok.com.br/sofa-3-lugares/p')).toBe('Tok&Stok');
    expect(storeFromUrl('https://produto.mercadolivre.com.br/MLB-123')).toBe('Mercado Livre');
    expect(storeFromUrl('amazon.com.br/dp/B0ABC')).toBe('Amazon');
    expect(storeFromUrl('https://www.magazineluiza.com.br/x')).toBe('Magazine Luiza');
  });

  it('usa a parte principal do domínio para as outras', () => {
    expect(storeFromUrl('https://lojadacasa.com.br/item')).toBe('Lojadacasa');
    expect(storeFromUrl('https://loja.exemplo.com/x')).toBe('Exemplo');
  });

  it('não inventa loja para texto que não é link', () => {
    expect(storeFromUrl('')).toBeNull();
    expect(storeFromUrl('colchão bom')).toBeNull();
  });
});

describe('normalizeUrl', () => {
  it('completa o https e recusa o que não é endereço', () => {
    expect(normalizeUrl('tokstok.com.br/x')).toBe('https://tokstok.com.br/x');
    expect(normalizeUrl('http://a.com')).toBe('http://a.com/');
    expect(normalizeUrl('sem ponto')).toBeNull();
    expect(normalizeUrl(null)).toBeNull();
  });
});
