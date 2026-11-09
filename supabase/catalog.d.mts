// Tipos de supabase/catalog.mjs, para o aplicativo importar o catálogo direto
// da fonte única (sem copiar a lista para dentro de src/).

export interface CatalogItem {
  name: string;
  qty: number;
  unit: string;
  /** E, I, O, N, P ou K — ver PRIORITY_MAP */
  prio: 'E' | 'I' | 'O' | 'N' | 'P' | 'K';
  sub: string;
  task?: boolean;
  frac?: boolean;
  qtyOpen?: boolean;
  note?: string;
}

export interface CatalogCategory {
  code: string;
  name: string;
  icon: string;
  items: CatalogItem[];
}

export declare const catalog: CatalogCategory[];

export declare const PRIORITY_MAP: Record<
  CatalogItem['prio'],
  { priority: 'essencial' | 'importante' | 'opcional'; note: string | null; conditional: boolean }
>;

export default catalog;
