import type { ItemQuote } from '@/types/database';

/** Preço final de uma cotação: o que sai do bolso ao comprar ali. */
export const quoteTotal = (quote: Pick<ItemQuote, 'price' | 'shipping'>) =>
  Number(quote.price) + Number(quote.shipping || 0);

export interface QuoteComparison {
  /** da mais barata para a mais cara; empate fica com a cadastrada antes */
  ranked: ItemQuote[];
  best: ItemQuote | null;
  /** a segunda mais barata — é contra ela que a economia é medida */
  runnerUp: ItemQuote | null;
  worst: ItemQuote | null;
  /** quanto a mais barata economiza frente à segunda */
  saving: number;
  /** a mesma economia, em fração do preço da segunda (0,04 = 4%) */
  savingRatio: number;
  /** diferença entre a mais cara e a mais barata */
  spread: number;
  /** duas ou mais lojas com o mesmo menor preço */
  tie: boolean;
}

export function compareQuotes(quotes: readonly ItemQuote[]): QuoteComparison {
  const ranked = [...quotes].sort(
    (a, b) => quoteTotal(a) - quoteTotal(b) || a.created_at.localeCompare(b.created_at),
  );
  const best = ranked[0] ?? null;
  const runnerUp = ranked[1] ?? null;
  const worst = ranked.length > 0 ? ranked[ranked.length - 1] : null;
  const saving = best && runnerUp ? round2(quoteTotal(runnerUp) - quoteTotal(best)) : 0;
  const base = runnerUp ? quoteTotal(runnerUp) : 0;

  return {
    ranked,
    best,
    runnerUp,
    worst,
    saving,
    savingRatio: base > 0 ? saving / base : 0,
    spread: best && worst ? round2(quoteTotal(worst) - quoteTotal(best)) : 0,
    tie: Boolean(best && runnerUp && saving === 0),
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Lojas conhecidas: o domínio vira o nome que as pessoas usam. */
const LOJAS: [RegExp, string][] = [
  [/(^|\.)amazon\./, 'Amazon'],
  [/(^|\.)mercadoli[vb]re\.|(^|\.)mercadolivre\./, 'Mercado Livre'],
  [/(^|\.)magazineluiza\.|(^|\.)magalu\./, 'Magazine Luiza'],
  [/(^|\.)casasbahia\./, 'Casas Bahia'],
  [/(^|\.)pontofrio\./, 'Ponto'],
  [/(^|\.)americanas\./, 'Americanas'],
  [/(^|\.)submarino\./, 'Submarino'],
  [/(^|\.)shoptime\./, 'Shoptime'],
  [/(^|\.)tokstok\./, 'Tok&Stok'],
  [/(^|\.)camicado\./, 'Camicado'],
  [/(^|\.)leroymerlin\./, 'Leroy Merlin'],
  [/(^|\.)madeiramadeira\./, 'MadeiraMadeira'],
  [/(^|\.)mobly\./, 'Mobly'],
  [/(^|\.)westwing\./, 'Westwing'],
  [/(^|\.)etna\./, 'Etna'],
  [/(^|\.)shopee\./, 'Shopee'],
  [/(^|\.)aliexpress\./, 'AliExpress'],
  [/(^|\.)kabum\./, 'KaBuM!'],
  [/(^|\.)carrefour\./, 'Carrefour'],
  [/(^|\.)fastshop\./, 'Fast Shop'],
  [/(^|\.)havan\./, 'Havan'],
  [/(^|\.)riachuelo\./, 'Riachuelo'],
  [/(^|\.)renner\./, 'Renner'],
  [/(^|\.)zarahome\./, 'Zara Home'],
  [/(^|\.)ikea\./, 'IKEA'],
  [/(^|\.)telhanorte\./, 'Telhanorte'],
  [/(^|\.)c-?and-?c\.|(^|\.)cec\./, 'C&C'],
];

/**
 * Nome da loja a partir de um link colado: "https://www.tokstok.com.br/x"
 * vira "Tok&Stok"; um domínio desconhecido vira a parte principal com
 * maiúscula ("lojadacasa.com.br" → "Lojadacasa"). Sem link válido, null.
 */
export function storeFromUrl(raw: string): string | null {
  const texto = raw.trim();
  if (!texto) return null;
  let host: string;
  try {
    host = new URL(/^https?:\/\//i.test(texto) ? texto : `https://${texto}`).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (!host.includes('.')) return null;
  host = host.replace(/^www\d?\./, '').replace(/^m\./, '');

  for (const [padrao, nome] of LOJAS) if (padrao.test(host)) return nome;

  // "lojadacasa.com.br" → "Lojadacasa"; "loja.exemplo.com" → "Exemplo"
  const semSufixo = host.replace(/\.(com|net|org|art|ind|blog)?\.?br$|\.(com|net|org|store|shop|io)$/, '');
  const partes = semSufixo.split('.').filter(Boolean);
  const principal = partes[partes.length - 1] ?? host;
  return principal.charAt(0).toUpperCase() + principal.slice(1);
}

/** Link pronto para abrir: completa o "https://" que as pessoas não digitam. */
export function normalizeUrl(raw: string | null | undefined): string | null {
  const texto = (raw ?? '').trim();
  if (!texto) return null;
  const comEsquema = /^https?:\/\//i.test(texto) ? texto : `https://${texto}`;
  try {
    const url = new URL(comEsquema);
    return url.hostname.includes('.') ? url.toString() : null;
  } catch {
    return null;
  }
}
