#!/usr/bin/env node
/**
 * Gera, a partir de `supabase/catalog.mjs`:
 *   · supabase/migrations/0004_catalog_seed.sql  — a lista inicial do enxoval
 *   · supabase/schema.sql                        — 0001..0004 concatenados,
 *                                                  para colar no SQL Editor
 *
 * Uso: node scripts/gen-catalog-sql.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { catalog, PRIORITY_MAP } from '../supabase/catalog.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const migrations = join(root, 'supabase', 'migrations');

/** Literal SQL seguro para texto. */
const q = (v) => (v === null || v === undefined || v === '' ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
const b = (v) => (v ? 'true' : 'false');

const catRows = [];
const itemRows = [];
let catOrder = 0;

for (const category of catalog) {
  catOrder += 1;
  catRows.push(`  (${q(category.code)}, ${q(category.name)}, ${q(category.icon)}, ${catOrder})`);

  let itemOrder = 0;
  for (const item of category.items) {
    itemOrder += 1;
    const map = PRIORITY_MAP[item.prio];
    if (!map) throw new Error(`Prioridade desconhecida "${item.prio}" em ${item.name}`);

    // A observação do catálogo vence; a do mapeamento de prioridade complementa.
    const notes = [item.note, map.note].filter(Boolean).join(' ') || null;

    itemRows.push(
      `  (${q(category.code)}, ${q(item.name)}, ${q(item.sub)}, ${q(item.unit)}, ` +
        `${item.qty}, ${q(map.priority)}, ${b(map.conditional)}, ${b(item.task)}, ` +
        `${b(item.frac)}, ${b(item.qtyOpen)}, ${q(notes)}, ${itemOrder})`,
    );
  }
}

const header = `-- ============================================================================
--  NOSSO LAR — 0004 · Lista inicial do enxoval (catálogo de referência)
--
--  ARQUIVO GERADO — não edite à mão.
--  Fonte: supabase/catalog.mjs   ·   Regerar: node scripts/gen-catalog-sql.mjs
--
--  ${catalog.length} categorias · ${itemRows.length} linhas
--  (${itemRows.length - catalog.reduce((n, c) => n + c.items.filter((x) => x.task).length, 0)} produtos +
--   ${catalog.reduce((n, c) => n + c.items.filter((x) => x.task).length, 0)} tarefas de verificação)
--
--  Todos nascem com preço estimado R$ 0,00, quantidade comprada 0 e status
--  "pendente". Nenhuma compra fictícia é registrada.
-- ============================================================================

`;

const sql = `${header}insert into public.catalog_categories (code, name, icon, sort_order) values
${catRows.join(',\n')}
on conflict (code) do update
  set name = excluded.name,
      icon = excluded.icon,
      sort_order = excluded.sort_order;

-- Recarrega a lista de referência por completo (não afeta os itens já
-- copiados para os espaços do casal).
delete from public.catalog_items;

insert into public.catalog_items
  (category_code, name, subcategory, unit, qty, priority,
   conditional, is_task, allow_fraction, qty_open, notes, sort_order) values
${itemRows.join(',\n')};
`;

writeFileSync(join(migrations, '0004_catalog_seed.sql'), sql, 'utf8');

// ─── schema.sql: tudo em um arquivo, na ordem correta ───
const files = [
  '0001_schema.sql',
  '0002_functions.sql',
  '0003_rls.sql',
  '0004_catalog_seed.sql',
];
const banner = `-- ============================================================================
--  NOSSO LAR — esquema completo do banco (arquivo gerado)
--
--  Cole este arquivo inteiro no SQL Editor do Supabase e execute uma única vez.
--  Equivale a rodar, em ordem: ${files.join(' → ')}
--
--  Regenerar: node scripts/gen-catalog-sql.mjs
-- ============================================================================

`;

const bundle =
  banner +
  files
    .map((f) => `\n-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  ${f.padEnd(70)}║
-- ╚══════════════════════════════════════════════════════════════════════════╝\n\n${readFileSync(join(migrations, f), 'utf8')}`)
    .join('\n');

writeFileSync(join(root, 'supabase', 'schema.sql'), bundle, 'utf8');

const tasks = catalog.reduce((n, c) => n + c.items.filter((x) => x.task).length, 0);
console.log(`✓ 0004_catalog_seed.sql — ${catalog.length} categorias, ${itemRows.length} linhas`);
console.log(`  ${itemRows.length - tasks} produtos + ${tasks} tarefas de verificação`);
console.log('✓ supabase/schema.sql — esquema completo concatenado');
