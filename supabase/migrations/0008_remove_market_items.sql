-- Compras de mercado saem da lista inicial do enxoval.
--
-- Primeira compra de supermercado (N), produtos de limpeza (G) e higiene
-- pessoal (M) são reposição, feitas depois da casa montada — não enxoval.
-- Aqui elas saem do catálogo de referência, então espaços novos já nascem
-- sem elas (11 categorias, 174 linhas). A cascata leva os itens do catálogo.
--
-- Os espaços que já existem são limpos pelo próprio aplicativo, com a
-- permissão de quem está no espaço (ver src/lib/retiredItems.ts): só os
-- itens originais do catálogo, e só os que não têm compra nem cotação.

delete from public.catalog_categories where code in ('G', 'M', 'N');
