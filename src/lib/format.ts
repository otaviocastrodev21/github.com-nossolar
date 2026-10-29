/**
 * Formatação e leitura de números no padrão brasileiro.
 *
 * Dinheiro sempre sai como R$ 1.234,56. Entrada aceita o que a pessoa
 * digitaria de verdade: "1.234,56", "1234,56", "R$ 80", "80.5".
 */

const brl = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const brlCompactFmt = new Intl.NumberFormat('pt-BR', {
  notation: 'compact',
  compactDisplay: 'short',
  maximumFractionDigits: 1,
});

const intFmt = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

const pctFmt = new Intl.NumberFormat('pt-BR', {
  style: 'percent',
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

/** R$ 1.234,56 */
export function money(value: number | null | undefined): string {
  return brl.format(Number.isFinite(Number(value)) ? Number(value) : 0);
}

/** R$ 1,2 mil — para eixos de gráfico e espaços estreitos. */
export function moneyCompact(value: number | null | undefined): string {
  const n = Number.isFinite(Number(value)) ? Number(value) : 0;
  if (Math.abs(n) < 1000) return money(n);
  return `R$ ${brlCompactFmt.format(n)}`;
}

/** 1.234 */
export function integer(value: number | null | undefined): string {
  return intFmt.format(Number.isFinite(Number(value)) ? Number(value) : 0);
}

/**
 * Quantidade: inteira quando possível, até 3 decimais quando fracionada
 * (peso/volume de supermercado).
 */
export function quantity(value: number | null | undefined): string {
  const n = Number.isFinite(Number(value)) ? Number(value) : 0;
  if (Number.isInteger(n)) return intFmt.format(n);
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 3,
  }).format(n);
}

/** 0.4567 -> "45,7%" */
export function percent(ratio: number | null | undefined): string {
  const n = Number.isFinite(Number(ratio)) ? Number(ratio) : 0;
  return pctFmt.format(n);
}

/** 45.67 -> "46%" (já em pontos percentuais, arredondado) */
export function percentPoints(points: number | null | undefined): string {
  const n = Number.isFinite(Number(points)) ? Number(points) : 0;
  return `${intFmt.format(Math.round(n))}%`;
}

/** "2026-03-14" -> "14/03/2026" */
export function dateBR(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = parseISODate(iso);
  if (!d) return '—';
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(d);
}

/** "2026-03-14" -> "14 de março de 2026" */
export function dateLongBR(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = parseISODate(iso);
  if (!d) return '—';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeZone: 'UTC' }).format(d);
}

/** Data e hora de um timestamptz, no fuso do navegador. */
export function dateTimeBR(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(d);
}

/** "2026-03" ou "2026-03-01" -> "mar/2026" */
export function monthShortBR(monthKey: string): string {
  const [y, m] = monthKey.split('-');
  const d = new Date(Date.UTC(Number(y), Number(m) - 1, 1));
  if (Number.isNaN(d.getTime())) return monthKey;
  const label = new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: 'UTC' }).format(d);
  return `${label.replace('.', '')}/${y}`;
}

/** "2026-03" -> "março de 2026" */
export function monthLongBR(monthKey: string): string {
  const [y, m] = monthKey.split('-');
  const d = new Date(Date.UTC(Number(y), Number(m) - 1, 1));
  if (Number.isNaN(d.getTime())) return monthKey;
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(d);
}

function parseISODate(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (m) {
    return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  }
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Lê um número digitado por uma pessoa brasileira.
 * Retorna NaN quando não há nada aproveitável.
 */
export function parseNumberBR(input: string | number | null | undefined): number {
  if (typeof input === 'number') return Number.isFinite(input) ? input : Number.NaN;
  if (input === null || input === undefined) return Number.NaN;

  let s = String(input).trim();
  if (!s) return Number.NaN;

  s = s.replace(/[R$\s ]/gi, '');
  if (!s) return Number.NaN;

  const hasComma = s.includes(',');
  const hasDot = s.includes('.');

  if (hasComma && hasDot) {
    // "1.234,56" -> ponto é separador de milhar
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (hasComma) {
    s = s.replace(',', '.');
  } else if (hasDot) {
    // "1.234" é milhar; "80.5" é decimal. Decide pelo tamanho do último grupo.
    const parts = s.split('.');
    const last = parts[parts.length - 1];
    if (parts.length > 2 || last.length === 3) s = parts.join('');
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : Number.NaN;
}

/** Igual a parseNumberBR, mas devolve `fallback` em vez de NaN. */
export function toNumber(input: string | number | null | undefined, fallback = 0): number {
  const n = parseNumberBR(input);
  return Number.isNaN(n) ? fallback : n;
}

/** Arredonda para centavos, evitando o resíduo de ponto flutuante. */
export function cents(value: number): number {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

/** Hoje em "AAAA-MM-DD", no fuso local (para `<input type="date">`). */
export function todayISO(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "AAAA-MM" do mês corrente. */
export function currentMonthKey(): string {
  return todayISO().slice(0, 7);
}

/** Primeiro dia do mês em ISO, a partir de "AAAA-MM". */
export function monthKeyToISO(monthKey: string): string {
  return `${monthKey}-01`;
}

/** Pluraliza sem firulas: plural(2, 'item', 'itens') -> "2 itens". */
export function plural(n: number, one: string, many: string): string {
  return `${integer(n)} ${n === 1 ? one : many}`;
}

/** Primeiras letras para o avatar do participante. */
export function initials(name: string | null | undefined, email?: string | null): string {
  const base = (name || '').trim() || (email || '').split('@')[0] || '?';
  const parts = base.split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Identificador único para o campo `client_token` das compras — é o que impede
 * registro duplicado quando as duas pessoas salvam ao mesmo tempo.
 *
 * `crypto.randomUUID` só existe em contexto seguro (https ou localhost); em
 * http simples caímos num gerador equivalente para a finalidade.
 */
export function uuid(): string {
  const api = globalThis.crypto;
  if (api && typeof api.randomUUID === 'function') return api.randomUUID();

  const bytes = new Uint8Array(16);
  if (api && typeof api.getRandomValues === 'function') {
    api.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // versão 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variante
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
