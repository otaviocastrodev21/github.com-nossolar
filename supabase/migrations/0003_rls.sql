-- ============================================================================
--  NOSSO LAR — 0003 · Row Level Security e permissões por coluna
--
--  Princípio: cada espaço (casal) só alcança os próprios dados. Toda tabela é
--  filtrada por `is_space_member(space_id)`.
--
--  Além do RLS, usamos GRANT por coluna para que o cliente NUNCA consiga
--  escrever um agregado financeiro (qty_bought, total_spent, paid_amount).
--  Esses campos só mudam pelos triggers, que rodam como owner.
-- ============================================================================

alter table public.profiles          enable row level security;
alter table public.spaces            enable row level security;
alter table public.space_members     enable row level security;
alter table public.space_codes       enable row level security;
alter table public.categories        enable row level security;
alter table public.items             enable row level security;
alter table public.purchases         enable row level security;
alter table public.installments      enable row level security;
alter table public.payments          enable row level security;
alter table public.budgets           enable row level security;
alter table public.extra_expenses    enable row level security;
alter table public.activity_log      enable row level security;
alter table public.catalog_categories enable row level security;
alter table public.catalog_items     enable row level security;

-- ─────────────────────────────── Perfis ────────────────────────────────────
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.shares_space_with(id));

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ─────────────────────────────── Espaços ───────────────────────────────────
drop policy if exists spaces_select on public.spaces;
create policy spaces_select on public.spaces
  for select to authenticated
  using (public.is_space_member(id));

-- Ambos editam nome, subtítulo e meta mensal (seção 6 do briefing).
drop policy if exists spaces_update on public.spaces;
create policy spaces_update on public.spaces
  for update to authenticated
  using (public.is_space_member(id))
  with check (public.is_space_member(id));

drop policy if exists spaces_delete on public.spaces;
create policy spaces_delete on public.spaces
  for delete to authenticated
  using (public.is_space_owner(id));

-- ───────────────────────────── Participantes ───────────────────────────────
drop policy if exists space_members_select on public.space_members;
create policy space_members_select on public.space_members
  for select to authenticated
  using (public.is_space_member(space_id));

-- Remover alguém: o dono remove qualquer um; cada pessoa pode remover a si.
drop policy if exists space_members_delete on public.space_members;
create policy space_members_delete on public.space_members
  for delete to authenticated
  using (public.is_space_owner(space_id) or user_id = auth.uid());

-- ────────────────────────── Códigos de acesso ──────────────────────────────
-- Só quem já está no espaço enxerga os códigos dele. Quem está entrando não
-- precisa ler nada: digita o código e a função `join_with_code` (SECURITY
-- DEFINER) resolve. Isso evita que alguém liste códigos à procura de um válido.
drop policy if exists space_codes_select on public.space_codes;
create policy space_codes_select on public.space_codes
  for select to authenticated
  using (public.is_space_member(space_id));

-- Apagar um código é como trocar a fechadura: pode ser feito a qualquer momento.
drop policy if exists space_codes_delete on public.space_codes;
create policy space_codes_delete on public.space_codes
  for delete to authenticated
  using (public.is_space_member(space_id));

-- ─────────────────── Tabelas escopadas por espaço ──────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array['categories', 'items', 'purchases', 'budgets', 'extra_expenses']
  loop
    execute format('drop policy if exists %1$s_select on public.%1$s', t);
    execute format(
      'create policy %1$s_select on public.%1$s for select to authenticated
         using (public.is_space_member(space_id))', t);

    execute format('drop policy if exists %1$s_insert on public.%1$s', t);
    execute format(
      'create policy %1$s_insert on public.%1$s for insert to authenticated
         with check (public.is_space_member(space_id))', t);

    execute format('drop policy if exists %1$s_update on public.%1$s', t);
    execute format(
      'create policy %1$s_update on public.%1$s for update to authenticated
         using (public.is_space_member(space_id))
         with check (public.is_space_member(space_id))', t);

    execute format('drop policy if exists %1$s_delete on public.%1$s', t);
    execute format(
      'create policy %1$s_delete on public.%1$s for delete to authenticated
         using (public.is_space_member(space_id))', t);
  end loop;
end;
$$;

-- ──────────── Derivadas: leitura apenas (quem escreve são os triggers) ──────
drop policy if exists installments_select on public.installments;
create policy installments_select on public.installments
  for select to authenticated
  using (public.is_space_member(space_id));

drop policy if exists payments_select on public.payments;
create policy payments_select on public.payments
  for select to authenticated
  using (public.is_space_member(space_id));

drop policy if exists activity_log_select on public.activity_log;
create policy activity_log_select on public.activity_log
  for select to authenticated
  using (public.is_space_member(space_id));

-- ───────────── Catálogo de referência: leitura para autenticados ───────────
drop policy if exists catalog_categories_select on public.catalog_categories;
create policy catalog_categories_select on public.catalog_categories
  for select to authenticated using (true);

drop policy if exists catalog_items_select on public.catalog_items;
create policy catalog_items_select on public.catalog_items
  for select to authenticated using (true);

-- ============================================================================
--  GRANTs por coluna — blindagem dos agregados financeiros
-- ============================================================================

revoke all on public.profiles           from anon, authenticated;
revoke all on public.spaces             from anon, authenticated;
revoke all on public.space_members      from anon, authenticated;
revoke all on public.space_codes        from anon, authenticated;
revoke all on public.categories         from anon, authenticated;
revoke all on public.items              from anon, authenticated;
revoke all on public.purchases          from anon, authenticated;
revoke all on public.installments       from anon, authenticated;
revoke all on public.payments           from anon, authenticated;
revoke all on public.budgets            from anon, authenticated;
revoke all on public.extra_expenses     from anon, authenticated;
revoke all on public.activity_log       from anon, authenticated;
revoke all on public.catalog_categories from anon, authenticated;
revoke all on public.catalog_items      from anon, authenticated;

grant select on public.profiles to authenticated;
grant update (display_name, updated_at) on public.profiles to authenticated;

grant select on public.spaces to authenticated;
grant update (name, tagline, monthly_goal, updated_at) on public.spaces to authenticated;
grant delete on public.spaces to authenticated;

grant select, delete on public.space_members to authenticated;

-- Criar código é só pela RPC `create_access_code`; aqui vale ler e revogar.
grant select, delete on public.space_codes to authenticated;

grant select, insert, update, delete on public.categories to authenticated;

-- Itens: o cliente descreve o planejamento; os realizados são do banco.
grant select, delete on public.items to authenticated;
grant insert (
  space_id, category_id, name, subcategory, unit, qty_needed, unit_price_estimate,
  priority, excluded, is_task, task_done, allow_fraction, qty_open, conditional,
  is_custom, notes, product_url, sort_order, created_by
) on public.items to authenticated;
grant update (
  category_id, name, subcategory, unit, qty_needed, unit_price_estimate,
  priority, excluded, task_done, allow_fraction, qty_open, conditional,
  notes, product_url, sort_order, updated_at
) on public.items to authenticated;

grant select, insert, update, delete on public.purchases to authenticated;

-- Parcelas, pagamentos e histórico: somente leitura.
grant select on public.installments to authenticated;
grant select on public.payments     to authenticated;
grant select on public.activity_log to authenticated;

-- Orçamento entra pela RPC `set_budget`; remover é permitido direto.
grant select, delete on public.budgets to authenticated;

grant select, insert, update, delete on public.extra_expenses to authenticated;

grant select on public.catalog_categories to authenticated;
grant select on public.catalog_items      to authenticated;

grant usage, select on sequence public.activity_log_id_seq to authenticated;

-- ============================================================================
--  Realtime — sincronização entre os dispositivos do casal
-- ============================================================================
do $$
declare
  t text;
begin
  foreach t in array array['spaces', 'space_members', 'space_codes', 'categories', 'items', 'purchases',
                           'installments', 'payments', 'budgets', 'extra_expenses', 'activity_log']
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception
      when duplicate_object then null;   -- já está na publicação
      when undefined_object then null;   -- publicação ainda não existe neste projeto
    end;
  end loop;
end;
$$;
