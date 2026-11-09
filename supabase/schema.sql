-- ============================================================================
--  NOSSO LAR — esquema completo do banco (arquivo gerado)
--
--  Cole este arquivo inteiro no SQL Editor do Supabase e execute uma única vez.
--  Equivale a rodar, em ordem: 0001_schema.sql → 0002_functions.sql → 0003_rls.sql → 0004_catalog_seed.sql
--
--  Regenerar: node scripts/gen-catalog-sql.mjs
-- ============================================================================


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  0001_schema.sql                                                       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ============================================================================
--  NOSSO LAR — 0001 · Esquema
--  Controle do enxoval do casal: itens, compras, parcelas, orçamentos.
--
--  ── Como o acesso funciona (sem cadastro, sem senha) ──────────────────────
--   O aplicativo não tem tela de login. No primeiro uso ele abre uma sessão
--   anônima do Supabase: o dispositivo ganha uma identidade própria, com
--   `auth.uid()` de verdade, sem que ninguém digite e-mail ou senha.
--
--   Para a segunda pessoa entrar no mesmo espaço, a primeira gera um CÓDIGO
--   DE PAREAMENTO (tabela `space_codes`). Quem digita o código vira membro.
--   Todo o Row Level Security continua escrito sobre `auth.uid()`, então a
--   proteção entre casais é exatamente a mesma de antes.
--
--  Regras financeiras materializadas aqui (ver também 0002_functions.sql):
--   · purchases.total_paid  = valor integral da compra (já líquido de desconto
--                             e com frete incluído quando houver). Nunca somamos
--                             desconto/frete de novo em cima dele.
--   · installments          = derivado de purchases (tabela somente-leitura
--                             para o cliente). As `installments_paid` primeiras
--                             parcelas são as pagas.
--   · payments              = derivado das parcelas pagas. É o livro-caixa:
--                             TOTAL EFETIVAMENTE GASTO = soma de payments
--                             + extra_expenses.
--   · items.qty_bought / total_spent / paid_amount = recalculados por trigger
--                             a partir de purchases. Nunca escritos pelo cliente.
-- ============================================================================

create extension if not exists pgcrypto;

-- ─────────────────────────────── Perfis ────────────────────────────────────
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  -- Nulo nas sessões anônimas, que é o caso normal aqui.
  email        text,
  display_name text not null default 'Participante',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.profiles is
  'Nome visível de cada participante. Sem cadastro: o e-mail é quase sempre nulo.';

-- ───────────────────── Espaço compartilhado do casal ───────────────────────
create table if not exists public.spaces (
  id           uuid primary key default gen_random_uuid(),
  name         text not null default 'Nosso Lar' check (length(btrim(name)) between 1 and 80),
  tagline      text not null default 'Nosso enxoval, nossos planos.',
  monthly_goal numeric(14, 2) check (monthly_goal is null or monthly_goal >= 0),
  -- O espaço sobrevive a quem o criou: se um dispositivo some, o outro continua.
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on column public.spaces.monthly_goal is 'Meta mensal de compras. NULL = ainda não definida.';

create table if not exists public.space_members (
  space_id  uuid not null references public.spaces (id) on delete cascade,
  user_id   uuid not null references auth.users (id) on delete cascade,
  role      text not null default 'membro' check (role in ('dono', 'membro')),
  joined_at timestamptz not null default now(),
  primary key (space_id, user_id)
);

create index if not exists space_members_user_idx on public.space_members (user_id);

-- ─────────────────────── Códigos de acesso ────────────────────────────────
--  Substituem o convite por e-mail. Dois tipos:
--
--   · pareamento  — para ligar o aparelho da outra pessoa. Curto, de uso
--                   único e válido por 24 horas.
--   · recuperação — a volta para quem limpou os dados do navegador e perdeu
--                   a sessão anônima. Mais longo, sem prazo, reutilizável, e
--                   só existe um por espaço. É a chave de casa: quem tiver,
--                   entra.
create table if not exists public.space_codes (
  id           uuid primary key default gen_random_uuid(),
  space_id     uuid not null references public.spaces (id) on delete cascade,
  code         text not null unique,
  kind         text not null default 'pareamento'
                 check (kind in ('pareamento', 'recuperacao')),
  label        text,
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  -- NULL = não expira (é o caso do código de recuperação)
  expires_at   timestamptz,
  -- NULL = usos ilimitados
  uses_left    int check (uses_left is null or uses_left >= 0),
  use_count    int not null default 0,
  last_used_at timestamptz
);

-- Um único código de recuperação por espaço: gerar outro substitui o anterior.
create unique index if not exists space_codes_recuperacao_uq
  on public.space_codes (space_id)
  where kind = 'recuperacao';

create index if not exists space_codes_space_idx on public.space_codes (space_id);

-- ──────────────────────────── Categorias ───────────────────────────────────
create table if not exists public.categories (
  id         uuid primary key default gen_random_uuid(),
  space_id   uuid not null references public.spaces (id) on delete cascade,
  code       text not null check (length(btrim(code)) between 1 and 12),
  name       text not null check (length(btrim(name)) between 1 and 80),
  icon       text not null default 'package',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (space_id, code)
);

-- ────────────────────────── Itens do enxoval ───────────────────────────────
create table if not exists public.items (
  id                  uuid primary key default gen_random_uuid(),
  space_id            uuid not null references public.spaces (id) on delete cascade,
  category_id         uuid not null references public.categories (id) on delete restrict,
  name                text not null check (length(btrim(name)) between 1 and 160),
  subcategory         text,
  unit                text not null default 'unidade'
                        check (unit in ('unidade', 'peça', 'par', 'jogo', 'conjunto',
                                        'pacote', 'embalagem', 'lote', 'tarefa')),
  qty_needed          numeric(12, 3) not null default 1 check (qty_needed >= 0),
  unit_price_estimate numeric(12, 2) not null default 0 check (unit_price_estimate >= 0),
  priority            text not null default 'importante'
                        check (priority in ('essencial', 'importante', 'opcional')),

  -- Mantidos por trigger a partir de `purchases` (nunca escritos pelo cliente)
  qty_bought          numeric(12, 3) not null default 0 check (qty_bought >= 0),
  total_spent         numeric(14, 2) not null default 0 check (total_spent >= 0),
  paid_amount         numeric(14, 2) not null default 0 check (paid_amount >= 0),
  last_purchase_at    date,

  excluded            boolean not null default false,
  is_task             boolean not null default false,
  task_done           boolean not null default false,
  allow_fraction      boolean not null default false,
  qty_open            boolean not null default false,
  conditional         boolean not null default false,
  is_custom           boolean not null default false,

  notes               text,
  product_url         text,
  sort_order          int not null default 0,
  created_by          uuid references auth.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- ── Colunas derivadas (garantem que o cálculo nunca divirja) ──
  qty_pending numeric(12, 3) generated always as (
    case when excluded or is_task then 0
         else greatest(qty_needed - qty_bought, 0) end
  ) stored,

  estimated_total numeric(14, 2) generated always as (
    case when excluded or is_task then 0
         else round(qty_needed * unit_price_estimate, 2) end
  ) stored,

  estimated_remaining numeric(14, 2) generated always as (
    case when excluded or is_task then 0
         else round(greatest(qty_needed - qty_bought, 0) * unit_price_estimate, 2) end
  ) stored,

  -- Economia: estimado para as unidades JÁ compradas menos o que se pagou.
  savings numeric(14, 2) generated always as (
    case when excluded or is_task or unit_price_estimate = 0 then 0
         else round(qty_bought * unit_price_estimate - total_spent, 2) end
  ) stored,

  avg_unit_paid numeric(14, 4) generated always as (
    case when qty_bought > 0 then round(total_spent / qty_bought, 4) end
  ) stored,

  status text generated always as (
    case
      when excluded                                        then 'nao_sera_comprado'
      when is_task and task_done                           then 'comprado'
      when is_task                                         then 'pendente'
      when qty_needed > 0 and qty_bought >= qty_needed     then 'comprado'
      when qty_bought > 0                                  then 'parcial'
      else 'pendente'
    end
  ) stored,

  -- Fracionado só onde faz sentido (peso/volume de supermercado)
  constraint items_fraction_chk check (allow_fraction or qty_needed = trunc(qty_needed)),
  -- Tarefas de verificação não têm preço nem quantidade comprável
  constraint items_task_chk check (not is_task or unit = 'tarefa')
);

create index if not exists items_space_idx    on public.items (space_id);
create index if not exists items_category_idx on public.items (category_id);
create index if not exists items_status_idx   on public.items (space_id, status);
create index if not exists items_name_idx     on public.items (space_id, lower(name));

comment on column public.items.savings is
  'Economia por item: estimado das unidades compradas − valor real pago. Negativo = acima do estimado.';

-- ──────────────────────────── Compras ──────────────────────────────────────
create table if not exists public.purchases (
  id               uuid primary key default gen_random_uuid(),
  space_id         uuid not null references public.spaces (id) on delete cascade,
  item_id          uuid references public.items (id) on delete set null,
  category_id      uuid references public.categories (id) on delete set null,
  description      text not null default '' check (length(description) <= 200),

  qty              numeric(12, 3) not null default 1 check (qty > 0),
  unit_price       numeric(12, 2) not null default 0 check (unit_price >= 0),
  discount         numeric(12, 2) not null default 0 check (discount >= 0),
  shipping         numeric(12, 2) not null default 0 check (shipping >= 0),
  -- Valor integral efetivamente contratado. Desconto e frete JÁ estão refletidos.
  total_paid       numeric(14, 2) not null check (total_paid >= 0),

  purchased_at     date not null default current_date,
  store            text,
  payment_method   text not null default 'pix'
                     check (payment_method in ('dinheiro', 'pix', 'debito', 'credito',
                                               'boleto', 'transferencia', 'outro')),
  buyer_id         uuid references auth.users (id) on delete set null,

  installments     int not null default 1 check (installments between 1 and 60),
  installments_paid int not null default 1 check (installments_paid >= 0),
  first_due_date   date,

  notes            text,
  product_url      text,
  receipt_url      text,

  -- Idempotência: impede registro duplicado quando as duas pessoas salvam junto
  client_token     uuid not null default gen_random_uuid(),

  created_by       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint purchases_installments_paid_chk check (installments_paid <= installments),
  constraint purchases_client_token_uq unique (space_id, client_token),
  constraint purchases_subject_chk check (item_id is not null or length(btrim(description)) > 0)
);

create index if not exists purchases_space_date_idx on public.purchases (space_id, purchased_at desc);
create index if not exists purchases_item_idx       on public.purchases (item_id);
create index if not exists purchases_category_idx   on public.purchases (space_id, category_id);
create index if not exists purchases_buyer_idx      on public.purchases (space_id, buyer_id);

comment on column public.purchases.total_paid is
  'Valor integral da compra. Desconto e frete já considerados — nunca somar novamente.';
comment on column public.purchases.installments_paid is
  'Quantidade de parcelas já quitadas (as N primeiras). Fonte da verdade do desembolso.';

-- ──────────────────────── Parcelas (derivadas) ─────────────────────────────
create table if not exists public.installments (
  id          uuid primary key default gen_random_uuid(),
  space_id    uuid not null references public.spaces (id) on delete cascade,
  purchase_id uuid not null references public.purchases (id) on delete cascade,
  number      int not null check (number >= 1),
  amount      numeric(14, 2) not null check (amount >= 0),
  due_date    date,
  paid        boolean not null default false,
  paid_at     date,
  created_at  timestamptz not null default now(),
  unique (purchase_id, number)
);

create index if not exists installments_space_idx on public.installments (space_id, due_date);
create index if not exists installments_open_idx  on public.installments (space_id) where not paid;

comment on table public.installments is
  'Gerada automaticamente a partir de purchases. Somente leitura para o cliente.';

-- ──────────────────── Pagamentos realizados (livro-caixa) ──────────────────
create table if not exists public.payments (
  id             uuid primary key default gen_random_uuid(),
  space_id       uuid not null references public.spaces (id) on delete cascade,
  purchase_id    uuid not null references public.purchases (id) on delete cascade,
  installment_id uuid not null unique references public.installments (id) on delete cascade,
  amount         numeric(14, 2) not null check (amount >= 0),
  paid_at        date not null,
  method         text,
  created_at     timestamptz not null default now()
);

create index if not exists payments_space_date_idx on public.payments (space_id, paid_at desc);

comment on table public.payments is
  'Derivada das parcelas pagas. Soma = total efetivamente desembolsado em compras.';

-- ────────────────────────── Orçamentos ─────────────────────────────────────
create table if not exists public.budgets (
  id          uuid primary key default gen_random_uuid(),
  space_id    uuid not null references public.spaces (id) on delete cascade,
  kind        text not null check (kind in ('total', 'categoria', 'mensal')),
  category_id uuid references public.categories (id) on delete cascade,
  month       date,
  amount      numeric(14, 2) not null check (amount >= 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint budgets_shape_chk check (
    (kind = 'total'     and category_id is null     and month is null) or
    (kind = 'categoria' and category_id is not null and month is null) or
    (kind = 'mensal'    and category_id is null     and month is not null)
  )
);

create unique index if not exists budgets_total_uq on public.budgets (space_id) where kind = 'total';
create unique index if not exists budgets_cat_uq   on public.budgets (space_id, category_id) where kind = 'categoria';
create unique index if not exists budgets_month_uq on public.budgets (space_id, month) where kind = 'mensal';

comment on table public.budgets is
  'Ausência de linha kind=total significa "orçamento ainda não definido" — o painel nasce zerado.';

-- ───────────────── Despesas adicionais (frete, montagem…) ──────────────────
create table if not exists public.extra_expenses (
  id          uuid primary key default gen_random_uuid(),
  space_id    uuid not null references public.spaces (id) on delete cascade,
  category_id uuid references public.categories (id) on delete set null,
  description text not null check (length(btrim(description)) between 1 and 200),
  kind        text not null default 'outros'
                check (kind in ('frete', 'montagem', 'instalacao', 'taxa', 'outros')),
  amount      numeric(14, 2) not null check (amount >= 0),
  spent_at    date not null default current_date,
  store       text,
  buyer_id    uuid references auth.users (id) on delete set null,
  notes       text,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists extra_expenses_space_idx on public.extra_expenses (space_id, spent_at desc);

-- ───────────────────── Histórico de alterações ─────────────────────────────
create table if not exists public.activity_log (
  id         bigserial primary key,
  space_id   uuid not null references public.spaces (id) on delete cascade,
  actor_id   uuid references auth.users (id) on delete set null,
  entity     text not null,
  entity_id  uuid,
  action     text not null check (action in ('criado', 'atualizado', 'excluido')),
  summary    text not null,
  payload    jsonb,
  created_at timestamptz not null default now()
);

create index if not exists activity_log_space_idx on public.activity_log (space_id, created_at desc);

-- ──────────── Catálogo de referência (lista inicial do enxoval) ────────────
create table if not exists public.catalog_categories (
  code       text primary key,
  name       text not null,
  icon       text not null default 'package',
  sort_order int not null default 0
);

create table if not exists public.catalog_items (
  id             bigserial primary key,
  category_code  text not null references public.catalog_categories (code) on delete cascade,
  name           text not null,
  subcategory    text,
  unit           text not null,
  qty            numeric(12, 3) not null,
  priority       text not null,
  conditional    boolean not null default false,
  is_task        boolean not null default false,
  allow_fraction boolean not null default false,
  qty_open       boolean not null default false,
  notes          text,
  sort_order     int not null default 0,
  unique (category_code, name)
);

comment on table public.catalog_items is
  'Lista inicial do enxoval (somente leitura). Copiada para `items` ao criar um espaço.';


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  0002_functions.sql                                                    ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ============================================================================
--  NOSSO LAR — 0002 · Funções, triggers e RPCs
--
--  Toda a consistência financeira vive aqui. O cliente nunca escreve valores
--  agregados: ele registra compras, e o banco recalcula quantidades, parcelas,
--  pagamentos e status.
-- ============================================================================

-- ─────────────────────── Helpers de autorização ────────────────────────────
-- SECURITY DEFINER para que as políticas de RLS possam consultar
-- `space_members` sem recursão.

create or replace function public.is_space_member(p_space uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.space_members m
    where m.space_id = p_space and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_space_owner(p_space uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.space_members m
    where m.space_id = p_space and m.user_id = auth.uid() and m.role = 'dono'
  );
$$;

create or replace function public.shares_space_with(p_user uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.space_members mine
    join public.space_members theirs on theirs.space_id = mine.space_id
    where mine.user_id = auth.uid() and theirs.user_id = p_user
  );
$$;

-- ───────────────────────────── Perfis ──────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Numa sessão anônima não há e-mail nenhum: o nome vem do que a pessoa
  -- digitar depois, e até lá fica "Participante".
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
      case
        when new.email is null or new.email = '' then 'Participante'
        else initcap(split_part(new.email, '@', 1))
      end
    )
  )
  on conflict (id) do update
    set email = coalesce(excluded.email, public.profiles.email),
        display_name = case
          when btrim(public.profiles.display_name) in ('', 'Participante')
            then excluded.display_name
          else public.profiles.display_name
        end,
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ──────────────────────── updated_at genérico ──────────────────────────────
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ───────────────────── Histórico de alterações ─────────────────────────────
create or replace function public.log_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space   uuid;
  v_label   text := tg_argv[0];
  v_action  text;
  v_id      uuid;
  v_payload jsonb;
  v_name    text;
begin
  -- Durante o cadastro da lista inicial não geramos 208 linhas de histórico.
  if coalesce(current_setting('nosso_lar.seeding', true), 'off') = 'on' then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  if tg_op = 'DELETE' then
    v_space := old.space_id; v_action := 'excluido'; v_id := old.id; v_payload := to_jsonb(old);
  else
    v_space := new.space_id; v_id := new.id; v_payload := to_jsonb(new);
    v_action := case when tg_op = 'INSERT' then 'criado' else 'atualizado' end;
  end if;

  -- O espaço está sendo apagado: a cascata já levou (ou levará) o histórico.
  -- Insistir aqui violaria a chave estrangeira e impediria a exclusão — foi
  -- o teste de integração contra o banco real que encontrou isso.
  if not exists (select 1 from public.spaces s where s.id = v_space) then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  v_name := coalesce(nullif(v_payload ->> 'name', ''), nullif(v_payload ->> 'description', ''), '');

  insert into public.activity_log (space_id, actor_id, entity, entity_id, action, summary, payload)
  values (
    v_space, auth.uid(), v_label, v_id, v_action,
    v_label || ' ' || v_action || case when v_name <> '' then ': ' || v_name else '' end,
    v_payload
  );

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

-- ═══════════════════════ Núcleo financeiro ═════════════════════════════════

-- Recalcula os agregados de um item a partir das suas compras.
-- `total_spent` = valor integral contratado; `paid_amount` = já desembolsado.
create or replace function public.recalc_item(p_item uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_item is null then
    return;
  end if;

  update public.items it
  set qty_bought       = coalesce(agg.qty, 0),
      total_spent      = coalesce(agg.total, 0),
      paid_amount      = coalesce(agg.paid, 0),
      last_purchase_at = agg.last_at,
      updated_at       = now()
  from (
    select p.item_id,
           sum(p.qty)                       as qty,
           sum(p.total_paid)                as total,
           sum(coalesce(pay.paid_sum, 0))   as paid,
           max(p.purchased_at)              as last_at
    from public.purchases p
    left join lateral (
      select sum(ins.amount) as paid_sum
      from public.installments ins
      where ins.purchase_id = p.id and ins.paid
    ) pay on true
    where p.item_id = p_item
    group by p.item_id
  ) agg
  where it.id = p_item;

  -- Sem compras restantes: volta a zero (e o status derivado volta a "pendente").
  update public.items
  set qty_bought = 0, total_spent = 0, paid_amount = 0, last_purchase_at = null, updated_at = now()
  where id = p_item
    and not exists (select 1 from public.purchases p where p.item_id = p_item);
end;
$$;

-- Validações e preenchimentos antes de gravar uma compra.
create or replace function public.purchases_before_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item record;
begin
  new.created_by := coalesce(new.created_by, auth.uid());
  new.buyer_id   := coalesce(new.buyer_id, auth.uid());

  if new.item_id is not null then
    select space_id, category_id, allow_fraction, name, is_task
      into v_item
      from public.items
     where id = new.item_id;

    if v_item is null then
      raise exception 'Item não encontrado.' using errcode = '23503';
    end if;
    if v_item.space_id <> new.space_id then
      raise exception 'O item pertence a outro espaço.' using errcode = '42501';
    end if;
    if not v_item.allow_fraction and new.qty <> trunc(new.qty) then
      raise exception 'O item "%" não aceita quantidade fracionada.', v_item.name
        using errcode = '22023';
    end if;

    new.category_id := coalesce(new.category_id, v_item.category_id);
    if btrim(new.description) = '' then
      new.description := v_item.name;
    end if;
  end if;

  if new.category_id is not null
     and not exists (select 1 from public.categories c
                      where c.id = new.category_id and c.space_id = new.space_id) then
    raise exception 'A categoria pertence a outro espaço.' using errcode = '42501';
  end if;

  if new.installments = 1 then
    new.first_due_date := null;
    new.installments_paid := least(new.installments_paid, 1);
  end if;

  return new;
end;
$$;

-- Gera/regenera as parcelas da compra. As `installments_paid` primeiras ficam pagas.
create or replace function public.purchases_sync_installments()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n    int;
  v_base numeric(14, 2);
  v_acc  numeric(14, 2) := 0;
  v_amt  numeric(14, 2);
  v_due  date;
  v_from date;
  k      int;
begin
  delete from public.installments where purchase_id = new.id;

  v_n    := greatest(new.installments, 1);
  v_base := round(new.total_paid / v_n, 2);
  v_from := coalesce(new.first_due_date, new.purchased_at);

  for k in 1..v_n loop
    if k < v_n then
      v_amt := v_base;
      v_acc := v_acc + v_base;
    else
      -- A última parcela absorve o arredondamento: a soma fecha sempre no total.
      v_amt := round(new.total_paid - v_acc, 2);
    end if;

    v_due := case
               when v_n = 1 then new.purchased_at
               else (v_from + ((k - 1) * interval '1 month'))::date
             end;

    insert into public.installments (space_id, purchase_id, number, amount, due_date, paid, paid_at)
    values (
      new.space_id, new.id, k, v_amt, v_due,
      k <= new.installments_paid,
      case when k <= new.installments_paid then least(v_due, current_date) end
    );
  end loop;

  return new;
end;
$$;

-- Livro-caixa: uma linha de pagamento por parcela paga.
create or replace function public.installments_sync_payments()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_method text;
begin
  if tg_op = 'DELETE' then
    delete from public.payments where installment_id = old.id;
    return old;
  end if;

  if new.paid then
    select payment_method into v_method from public.purchases where id = new.purchase_id;
    insert into public.payments (space_id, purchase_id, installment_id, amount, paid_at, method)
    values (new.space_id, new.purchase_id, new.id, new.amount,
            coalesce(new.paid_at, new.due_date, current_date), v_method)
    on conflict (installment_id) do update
      set amount  = excluded.amount,
          paid_at = excluded.paid_at,
          method  = excluded.method;
  else
    delete from public.payments where installment_id = new.id;
  end if;

  return new;
end;
$$;

-- Recalcula o(s) item(ns) afetados por uma compra.
create or replace function public.purchases_after_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.recalc_item(old.item_id);
    return old;
  end if;

  if tg_op = 'UPDATE' and old.item_id is distinct from new.item_id then
    perform public.recalc_item(old.item_id);
  end if;

  perform public.recalc_item(new.item_id);
  return new;
end;
$$;

-- Mudar a quantidade necessária não altera os agregados, mas pode mudar o status
-- derivado — as colunas geradas cuidam disso automaticamente.

-- Fecha a brecha de apontar para a categoria de OUTRO espaço: o RLS garante que
-- a linha é do seu espaço, mas não que a chave estrangeira também seja.
create or replace function public.assert_category_in_space()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.category_id is not null
     and not exists (
       select 1 from public.categories c
       where c.id = new.category_id and c.space_id = new.space_id
     ) then
    raise exception 'A categoria pertence a outro espaço.' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- ───────────────────────────── Triggers ────────────────────────────────────
-- A ordem de disparo é alfabética dentro do mesmo evento: 10 → 20 → 30.

drop trigger if exists trg_purchases_00_before on public.purchases;
create trigger trg_purchases_00_before
  before insert or update on public.purchases
  for each row execute function public.purchases_before_write();

drop trigger if exists trg_purchases_01_touch on public.purchases;
create trigger trg_purchases_01_touch
  before update on public.purchases
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_purchases_10_installments on public.purchases;
create trigger trg_purchases_10_installments
  after insert or update on public.purchases
  for each row execute function public.purchases_sync_installments();

drop trigger if exists trg_purchases_20_recalc on public.purchases;
create trigger trg_purchases_20_recalc
  after insert or update or delete on public.purchases
  for each row execute function public.purchases_after_write();

drop trigger if exists trg_purchases_30_log on public.purchases;
create trigger trg_purchases_30_log
  after insert or update or delete on public.purchases
  for each row execute function public.log_change('Compra');

drop trigger if exists trg_installments_10_payments on public.installments;
create trigger trg_installments_10_payments
  after insert or update or delete on public.installments
  for each row execute function public.installments_sync_payments();

drop trigger if exists trg_items_00_category on public.items;
create trigger trg_items_00_category
  before insert or update of category_id, space_id on public.items
  for each row execute function public.assert_category_in_space();

drop trigger if exists trg_items_01_touch on public.items;
create trigger trg_items_01_touch
  before update on public.items
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_items_30_log on public.items;
create trigger trg_items_30_log
  after insert or update or delete on public.items
  for each row execute function public.log_change('Item');

drop trigger if exists trg_budgets_01_touch on public.budgets;
create trigger trg_budgets_01_touch
  before update on public.budgets
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_budgets_30_log on public.budgets;
create trigger trg_budgets_30_log
  after insert or update or delete on public.budgets
  for each row execute function public.log_change('Orçamento');

drop trigger if exists trg_extra_00_category on public.extra_expenses;
create trigger trg_extra_00_category
  before insert or update of category_id, space_id on public.extra_expenses
  for each row execute function public.assert_category_in_space();

drop trigger if exists trg_extra_01_touch on public.extra_expenses;
create trigger trg_extra_01_touch
  before update on public.extra_expenses
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_extra_30_log on public.extra_expenses;
create trigger trg_extra_30_log
  after insert or update or delete on public.extra_expenses
  for each row execute function public.log_change('Despesa');

drop trigger if exists trg_spaces_01_touch on public.spaces;
create trigger trg_spaces_01_touch
  before update on public.spaces
  for each row execute function public.touch_updated_at();

-- ═════════════════════════════ RPCs ════════════════════════════════════════

-- Copia a lista inicial do enxoval para um espaço, sem duplicar o que já existe.
create or replace function public.seed_space_catalog(p_space uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  if not public.is_space_member(p_space) then
    raise exception 'Sem acesso a este espaço.' using errcode = '42501';
  end if;

  perform set_config('nosso_lar.seeding', 'on', true);

  insert into public.categories (space_id, code, name, icon, sort_order)
  select p_space, cc.code, cc.name, cc.icon, cc.sort_order
  from public.catalog_categories cc
  on conflict (space_id, code) do nothing;

  with inserted as (
    insert into public.items (
      space_id, category_id, name, subcategory, unit, qty_needed,
      priority, conditional, is_task, allow_fraction, qty_open, notes, sort_order
    )
    select p_space, c.id, ci.name, ci.subcategory, ci.unit, ci.qty,
           ci.priority, ci.conditional, ci.is_task, ci.allow_fraction, ci.qty_open,
           ci.notes, ci.sort_order
    from public.catalog_items ci
    join public.categories c on c.space_id = p_space and c.code = ci.category_code
    where not exists (
      select 1 from public.items it
      where it.space_id = p_space and lower(it.name) = lower(ci.name)
    )
    returning 1
  )
  select count(*) into v_count from inserted;

  perform set_config('nosso_lar.seeding', 'off', true);
  return v_count;
end;
$$;

-- Cria o espaço do casal já com as categorias e os 208 itens da lista inicial.
create or replace function public.create_space(p_name text default 'Nosso Lar')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space uuid;
  v_uid   uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Não autenticado.' using errcode = '28000';
  end if;

  insert into public.spaces (name, created_by)
  values (coalesce(nullif(btrim(p_name), ''), 'Nosso Lar'), v_uid)
  returning id into v_space;

  insert into public.space_members (space_id, user_id, role)
  values (v_space, v_uid, 'dono');

  perform public.seed_space_catalog(v_space);

  insert into public.activity_log (space_id, actor_id, entity, action, summary)
  values (v_space, v_uid, 'Espaço', 'criado', 'Espaço criado com a lista inicial do enxoval.');

  return v_space;
end;
$$;

-- ─────────────────────── Códigos de acesso ────────────────────────────────

-- Alfabeto sem caracteres que se confundem lidos em voz alta ou copiados à
-- mão: sem I, L, O, 0 e 1.
create or replace function public.gen_access_code(p_len int default 8)
returns text
language plpgsql
volatile
as $$
declare
  v_alfabeto constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_codigo   text := '';
  k          int;
begin
  for k in 1..p_len loop
    v_codigo := v_codigo || substr(v_alfabeto, 1 + floor(random() * length(v_alfabeto))::int, 1);
  end loop;
  -- Agrupado de quatro em quatro, que é mais fácil de ditar.
  return regexp_replace(v_codigo, '(.{4})(?=.)', '\1-', 'g');
end;
$$;

-- Normaliza o que a pessoa digitou: maiúsculas, sem hífen, sem espaço.
create or replace function public.normalize_access_code(p_code text)
returns text
language sql
immutable
as $$
  select upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
$$;

-- Gera um código para ligar outro aparelho ao espaço.
--
--   pareamento  → 8 caracteres, uso único, vale 24 horas
--   recuperacao → 12 caracteres, sem prazo, reutilizável, um por espaço
create or replace function public.create_access_code(
  p_space uuid,
  p_kind  text default 'pareamento',
  p_label text default null
)
returns public.space_codes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_codigo text;
  v_linha  public.space_codes;
  v_tent   int := 0;
begin
  if not public.is_space_member(p_space) then
    raise exception 'Sem acesso a este espaço.' using errcode = '42501';
  end if;
  if p_kind not in ('pareamento', 'recuperacao') then
    raise exception 'Tipo de código inválido.' using errcode = '22023';
  end if;

  -- Só existe um código de recuperação por espaço: gerar outro invalida o anterior.
  if p_kind = 'recuperacao' then
    delete from public.space_codes where space_id = p_space and kind = 'recuperacao';
  end if;

  -- Colisão é improvável, mas o código é único: tenta de novo se acontecer.
  loop
    v_tent := v_tent + 1;
    v_codigo := public.gen_access_code(case when p_kind = 'recuperacao' then 12 else 8 end);
    exit when not exists (
      select 1 from public.space_codes c
      where public.normalize_access_code(c.code) = public.normalize_access_code(v_codigo)
    );
    if v_tent > 20 then
      raise exception 'Não consegui gerar um código único. Tente de novo.';
    end if;
  end loop;

  insert into public.space_codes (space_id, code, kind, label, created_by, expires_at, uses_left)
  values (
    p_space,
    v_codigo,
    p_kind,
    nullif(btrim(coalesce(p_label, '')), ''),
    auth.uid(),
    case when p_kind = 'pareamento' then now() + interval '24 hours' end,
    case when p_kind = 'pareamento' then 1 end
  )
  returning * into v_linha;

  insert into public.activity_log (space_id, actor_id, entity, entity_id, action, summary)
  values (
    p_space, auth.uid(), 'Código', v_linha.id, 'criado',
    case when p_kind = 'recuperacao'
      then 'Novo código de recuperação gerado (o anterior deixou de valer).'
      else 'Código de pareamento gerado para ligar outro aparelho.'
    end
  );

  return v_linha;
end;
$$;

-- Entra num espaço usando um código. Vale para qualquer sessão, inclusive a
-- anônima que o aplicativo abre sozinho.
create or replace function public.join_with_code(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_limpo   text := public.normalize_access_code(p_code);
  v_linha   public.space_codes;
  v_ja_e    boolean;
begin
  if v_uid is null then
    raise exception 'Sessão não iniciada.' using errcode = '28000';
  end if;
  if length(v_limpo) < 6 then
    raise exception 'Código incompleto.' using errcode = '22023';
  end if;

  select * into v_linha
    from public.space_codes c
   where public.normalize_access_code(c.code) = v_limpo
   for update;

  if v_linha.id is null then
    raise exception 'Código não encontrado. Confira os caracteres.' using errcode = 'P0002';
  end if;
  if v_linha.expires_at is not null and v_linha.expires_at < now() then
    raise exception 'Este código expirou. Peça outro no aparelho que já está no espaço.'
      using errcode = '22023';
  end if;
  if v_linha.uses_left is not null and v_linha.uses_left <= 0 then
    raise exception 'Este código já foi usado. Peça outro.' using errcode = '22023';
  end if;

  select exists (
    select 1 from public.space_members m
    where m.space_id = v_linha.space_id and m.user_id = v_uid
  ) into v_ja_e;

  insert into public.space_members (space_id, user_id, role)
  values (v_linha.space_id, v_uid, 'membro')
  on conflict (space_id, user_id) do nothing;

  update public.space_codes
  set uses_left    = case when uses_left is null then null else uses_left - 1 end,
      use_count    = use_count + 1,
      last_used_at = now()
  where id = v_linha.id;

  if not v_ja_e then
    insert into public.activity_log (space_id, actor_id, entity, entity_id, action, summary)
    values (
      v_linha.space_id, v_uid, 'Participante', v_linha.id, 'criado',
      case when v_linha.kind = 'recuperacao'
        then 'Um aparelho voltou ao espaço pelo código de recuperação.'
        else 'Um novo aparelho entrou no espaço.'
      end
    );
  end if;

  return v_linha.space_id;
end;
$$;

-- Define (ou atualiza) um orçamento: total, por categoria ou meta de um mês.
create or replace function public.set_budget(
  p_space    uuid,
  p_kind     text,
  p_amount   numeric,
  p_category uuid default null,
  p_month    date default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id    uuid;
  v_month date := case when p_month is null then null else date_trunc('month', p_month)::date end;
begin
  if not public.is_space_member(p_space) then
    raise exception 'Sem acesso a este espaço.' using errcode = '42501';
  end if;
  if p_amount is null or p_amount < 0 then
    raise exception 'Informe um valor maior ou igual a zero.' using errcode = '22023';
  end if;
  if p_kind not in ('total', 'categoria', 'mensal') then
    raise exception 'Tipo de orçamento inválido.' using errcode = '22023';
  end if;
  if p_kind = 'categoria' and p_category is null then
    raise exception 'Informe a categoria.' using errcode = '22023';
  end if;
  if p_kind = 'mensal' and v_month is null then
    raise exception 'Informe o mês.' using errcode = '22023';
  end if;
  if p_category is not null
     and not exists (select 1 from public.categories c where c.id = p_category and c.space_id = p_space) then
    raise exception 'A categoria pertence a outro espaço.' using errcode = '42501';
  end if;

  if p_kind = 'total' then
    update public.budgets set amount = p_amount, updated_at = now()
    where space_id = p_space and kind = 'total' returning id into v_id;
  elsif p_kind = 'categoria' then
    update public.budgets set amount = p_amount, updated_at = now()
    where space_id = p_space and kind = 'categoria' and category_id = p_category returning id into v_id;
  else
    update public.budgets set amount = p_amount, updated_at = now()
    where space_id = p_space and kind = 'mensal' and month = v_month returning id into v_id;
  end if;

  if v_id is null then
    insert into public.budgets (space_id, kind, category_id, month, amount)
    values (p_space, p_kind,
            case when p_kind = 'categoria' then p_category end,
            case when p_kind = 'mensal' then v_month end,
            p_amount)
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

-- Sair do espaço (o último dono não pode sair sem transferir).
create or replace function public.leave_space(p_space uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if not public.is_space_member(p_space) then
    raise exception 'Sem acesso a este espaço.' using errcode = '42501';
  end if;
  if public.is_space_owner(p_space)
     and (select count(*) from public.space_members where space_id = p_space and role = 'dono') = 1
     and (select count(*) from public.space_members where space_id = p_space) > 1 then
    raise exception 'Transfira a titularidade antes de sair do espaço.' using errcode = '42501';
  end if;

  delete from public.space_members where space_id = p_space and user_id = v_uid;
end;
$$;

-- ─────────────────────── Permissões das RPCs ───────────────────────────────
revoke all on function public.seed_space_catalog(uuid)                    from public;
revoke all on function public.create_space(text)                          from public;
revoke all on function public.create_access_code(uuid, text, text)        from public;
revoke all on function public.join_with_code(text)                        from public;
revoke all on function public.set_budget(uuid, text, numeric, uuid, date) from public;
revoke all on function public.leave_space(uuid)                           from public;
revoke all on function public.recalc_item(uuid)                           from public;

grant execute on function public.seed_space_catalog(uuid)                    to authenticated;
grant execute on function public.create_space(text)                          to authenticated;
grant execute on function public.create_access_code(uuid, text, text)        to authenticated;
grant execute on function public.join_with_code(text)                        to authenticated;
grant execute on function public.gen_access_code(int)                        to authenticated;
grant execute on function public.normalize_access_code(text)                 to authenticated;
grant execute on function public.set_budget(uuid, text, numeric, uuid, date) to authenticated;
grant execute on function public.leave_space(uuid)                           to authenticated;
grant execute on function public.is_space_member(uuid)                       to authenticated;
grant execute on function public.is_space_owner(uuid)                        to authenticated;
grant execute on function public.shares_space_with(uuid)                     to authenticated;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  0003_rls.sql                                                          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

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


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  0004_catalog_seed.sql                                                 ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ============================================================================
--  NOSSO LAR — 0004 · Lista inicial do enxoval (catálogo de referência)
--
--  ARQUIVO GERADO — não edite à mão.
--  Fonte: supabase/catalog.mjs   ·   Regerar: node scripts/gen-catalog-sql.mjs
--
--  14 categorias · 208 linhas
--  (202 produtos +
--   6 tarefas de verificação)
--
--  Todos nascem com preço estimado R$ 0,00, quantidade comprada 0 e status
--  "pendente". Nenhuma compra fictícia é registrada.
-- ============================================================================

insert into public.catalog_categories (code, name, icon, sort_order) values
  ('A', 'Quarto do casal', 'bed', 1),
  ('B', 'Banheiro', 'shower-head', 2),
  ('C', 'Cozinha — panelas e utensílios', 'cooking-pot', 3),
  ('D', 'Cozinha — pratos, copos e organização', 'utensils', 4),
  ('E', 'Eletrodomésticos', 'refrigerator', 5),
  ('F', 'Lavanderia e limpeza', 'washing-machine', 6),
  ('G', 'Produtos de limpeza', 'spray-can', 7),
  ('H', 'Sala de estar', 'sofa', 8),
  ('I', 'Sala de jantar e receber visitas', 'armchair', 9),
  ('J', 'Organização geral', 'package', 10),
  ('K', 'Ferramentas e manutenção', 'wrench', 11),
  ('L', 'Segurança da casa', 'shield-check', 12),
  ('M', 'Higiene pessoal', 'bath', 13),
  ('N', 'Primeira compra de supermercado', 'shopping-cart', 14)
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
  ('A', 'Cama de casal ou queen', 'Cama e colchão', 'unidade', 1, 'essencial', false, false, false, false, null, 1),
  ('A', 'Colchão', 'Cama e colchão', 'unidade', 1, 'essencial', false, false, false, false, null, 2),
  ('A', 'Protetor impermeável para colchão', 'Cama e colchão', 'unidade', 1, 'essencial', false, false, false, false, null, 3),
  ('A', 'Travesseiros para dormir', 'Cama e colchão', 'unidade', 2, 'essencial', false, false, false, false, null, 4),
  ('A', 'Travesseiros extras', 'Cama e colchão', 'unidade', 2, 'opcional', false, false, false, false, null, 5),
  ('A', 'Jogos de lençol completos', 'Roupa de cama', 'jogo', 3, 'essencial', false, false, false, false, 'Cada jogo costuma trazer lençol com elástico, lençol de cima e fronhas.', 6),
  ('A', 'Edredom ou cobertor', 'Roupa de cama', 'unidade', 1, 'essencial', false, false, false, false, null, 7),
  ('A', 'Manta decorativa', 'Roupa de cama', 'unidade', 1, 'opcional', false, false, false, false, null, 8),
  ('A', 'Cobre-leito ou colcha', 'Roupa de cama', 'unidade', 1, 'opcional', false, false, false, false, null, 9),
  ('A', 'Fronhas extras', 'Roupa de cama', 'unidade', 4, 'opcional', false, false, false, false, null, 10),
  ('A', 'Mesas de cabeceira', 'Mobiliário', 'unidade', 2, 'opcional', false, false, false, false, null, 11),
  ('A', 'Luminárias de cabeceira', 'Iluminação', 'unidade', 2, 'opcional', false, false, false, false, null, 12),
  ('A', 'Guarda-roupa ou armário', 'Mobiliário', 'unidade', 1, 'essencial', false, false, false, false, null, 13),
  ('A', 'Cabides', 'Organização', 'unidade', 30, 'essencial', false, false, false, false, null, 14),
  ('A', 'Cesto para roupa suja', 'Organização', 'unidade', 1, 'essencial', false, false, false, false, null, 15),
  ('A', 'Cortina com varão ou trilho', 'Cortinas', 'conjunto', 1, 'essencial', false, false, false, false, null, 16),
  ('A', 'Espelho de corpo inteiro', 'Decoração', 'unidade', 1, 'opcional', false, false, false, false, null, 17),
  ('A', 'Lixeira pequena', 'Organização', 'unidade', 1, 'opcional', false, false, false, false, null, 18),
  ('B', 'Toalhas de banho', 'Toalhas', 'unidade', 4, 'essencial', false, false, false, false, null, 1),
  ('B', 'Toalhas de rosto', 'Toalhas', 'unidade', 2, 'essencial', false, false, false, false, null, 2),
  ('B', 'Toalhas de piso ou tapetes', 'Toalhas', 'unidade', 2, 'essencial', false, false, false, false, null, 3),
  ('B', 'Porta-sabonete líquido', 'Acessórios', 'unidade', 1, 'opcional', false, false, false, false, null, 4),
  ('B', 'Porta-escovas de dentes', 'Acessórios', 'unidade', 1, 'opcional', false, false, false, false, null, 5),
  ('B', 'Lixeira com tampa', 'Acessórios', 'unidade', 1, 'essencial', false, false, false, false, null, 6),
  ('B', 'Escova sanitária', 'Acessórios', 'unidade', 1, 'essencial', false, false, false, false, null, 7),
  ('B', 'Suporte para papel higiênico', 'Acessórios', 'unidade', 1, 'opcional', true, false, false, false, 'Depende da estrutura da residência — confirme a necessidade antes de comprar.', 8),
  ('B', 'Cortina de box', 'Acessórios', 'unidade', 1, 'opcional', true, false, false, false, 'Depende da estrutura da residência — confirme a necessidade antes de comprar.', 9),
  ('B', 'Espelho', 'Acessórios', 'unidade', 1, 'opcional', true, false, false, false, 'Depende da estrutura da residência — confirme a necessidade antes de comprar.', 10),
  ('B', 'Ganchos ou toalheiros', 'Acessórios', 'conjunto', 1, 'essencial', false, false, false, false, null, 11),
  ('B', 'Organizador para produtos', 'Organização', 'unidade', 1, 'opcional', false, false, false, false, null, 12),
  ('B', 'Papel higiênico para estoque inicial', 'Consumíveis', 'lote', 1, 'essencial', false, false, false, false, null, 13),
  ('B', 'Sabonetes, shampoo e condicionador', 'Consumíveis', 'lote', 1, 'essencial', false, false, false, false, null, 14),
  ('B', 'Creme dental e fio dental', 'Consumíveis', 'lote', 1, 'essencial', false, false, false, false, null, 15),
  ('C', 'Jogo de panelas', 'Panelas e assadeiras', 'jogo', 1, 'essencial', false, false, false, false, 'Jogo com 4 a 5 peças.', 1),
  ('C', 'Frigideira antiaderente', 'Panelas e assadeiras', 'unidade', 1, 'essencial', false, false, false, false, null, 2),
  ('C', 'Panela de pressão', 'Panelas e assadeiras', 'unidade', 1, 'essencial', false, false, false, false, null, 3),
  ('C', 'Leiteira ou fervedor', 'Panelas e assadeiras', 'unidade', 1, 'opcional', false, false, false, false, null, 4),
  ('C', 'Assadeira retangular', 'Panelas e assadeiras', 'unidade', 1, 'essencial', false, false, false, false, null, 5),
  ('C', 'Forma de bolo', 'Panelas e assadeiras', 'unidade', 1, 'opcional', false, false, false, false, null, 6),
  ('C', 'Travessa refratária', 'Panelas e assadeiras', 'unidade', 1, 'essencial', false, false, false, false, null, 7),
  ('C', 'Tábua de corte', 'Facas e corte', 'unidade', 1, 'essencial', false, false, false, false, null, 8),
  ('C', 'Faca de chef', 'Facas e corte', 'unidade', 1, 'essencial', false, false, false, false, null, 9),
  ('C', 'Faca de legumes', 'Facas e corte', 'unidade', 1, 'essencial', false, false, false, false, null, 10),
  ('C', 'Faca de pão', 'Facas e corte', 'unidade', 1, 'opcional', false, false, false, false, null, 11),
  ('C', 'Tesoura de cozinha', 'Facas e corte', 'unidade', 1, 'opcional', false, false, false, false, null, 12),
  ('C', 'Escorredor de macarrão', 'Preparo', 'unidade', 1, 'essencial', false, false, false, false, null, 13),
  ('C', 'Peneira', 'Preparo', 'unidade', 1, 'essencial', false, false, false, false, null, 14),
  ('C', 'Ralador', 'Preparo', 'unidade', 1, 'essencial', false, false, false, false, null, 15),
  ('C', 'Abridor de latas', 'Preparo', 'unidade', 1, 'essencial', false, false, false, false, null, 16),
  ('C', 'Abridor de garrafas', 'Preparo', 'unidade', 1, 'opcional', false, false, false, false, null, 17),
  ('C', 'Saca-rolhas', 'Preparo', 'unidade', 1, 'opcional', false, false, false, false, null, 18),
  ('C', 'Descascador de legumes', 'Preparo', 'unidade', 1, 'essencial', false, false, false, false, null, 19),
  ('C', 'Espremedor de alho', 'Preparo', 'unidade', 1, 'opcional', false, false, false, false, null, 20),
  ('C', 'Espremedor de limão', 'Preparo', 'unidade', 1, 'opcional', false, false, false, false, null, 21),
  ('C', 'Conjunto de colheres medidoras', 'Medidores', 'conjunto', 1, 'opcional', false, false, false, false, null, 22),
  ('C', 'Conjunto de medidores de xícaras', 'Medidores', 'conjunto', 1, 'opcional', false, false, false, false, null, 23),
  ('C', 'Concha', 'Utensílios de servir', 'unidade', 1, 'essencial', false, false, false, false, null, 24),
  ('C', 'Escumadeira', 'Utensílios de servir', 'unidade', 1, 'essencial', false, false, false, false, null, 25),
  ('C', 'Espátula', 'Utensílios de servir', 'unidade', 1, 'essencial', false, false, false, false, null, 26),
  ('C', 'Colher grande de servir', 'Utensílios de servir', 'unidade', 1, 'essencial', false, false, false, false, null, 27),
  ('C', 'Pegador de alimentos', 'Utensílios de servir', 'unidade', 1, 'opcional', false, false, false, false, null, 28),
  ('C', 'Batedor de arame', 'Preparo', 'unidade', 1, 'opcional', false, false, false, false, null, 29),
  ('C', 'Pegadores de panela', 'Proteção e apoio', 'unidade', 2, 'essencial', false, false, false, false, null, 30),
  ('C', 'Descansos de panela', 'Proteção e apoio', 'unidade', 2, 'essencial', false, false, false, false, null, 31),
  ('D', 'Pratos rasos', 'Louças', 'unidade', 6, 'essencial', false, false, false, false, null, 1),
  ('D', 'Pratos fundos', 'Louças', 'unidade', 6, 'essencial', false, false, false, false, null, 2),
  ('D', 'Pratos de sobremesa', 'Louças', 'unidade', 6, 'opcional', false, false, false, false, null, 3),
  ('D', 'Tigelas ou bowls', 'Louças', 'unidade', 6, 'essencial', false, false, false, false, null, 4),
  ('D', 'Copos de água', 'Copos e canecas', 'unidade', 6, 'essencial', false, false, false, false, null, 5),
  ('D', 'Canecas', 'Copos e canecas', 'unidade', 4, 'essencial', false, false, false, false, null, 6),
  ('D', 'Xícaras de café', 'Copos e canecas', 'unidade', 4, 'opcional', false, false, false, false, null, 7),
  ('D', 'Jogo de talheres para 6 pessoas', 'Talheres', 'jogo', 1, 'essencial', false, false, false, false, null, 8),
  ('D', 'Talheres de servir', 'Talheres', 'conjunto', 1, 'essencial', false, false, false, false, null, 9),
  ('D', 'Travessas para servir', 'Servir', 'unidade', 2, 'opcional', false, false, false, false, null, 10),
  ('D', 'Saladeira', 'Servir', 'unidade', 1, 'opcional', false, false, false, false, null, 11),
  ('D', 'Jarra de água', 'Servir', 'unidade', 1, 'essencial', false, false, false, false, null, 12),
  ('D', 'Garrafa térmica', 'Servir', 'unidade', 1, 'opcional', false, false, false, false, null, 13),
  ('D', 'Escorredor de louças', 'Organização', 'unidade', 1, 'essencial', false, false, false, false, null, 14),
  ('D', 'Porta-talheres', 'Organização', 'unidade', 1, 'opcional', false, false, false, false, null, 15),
  ('D', 'Porta-temperos', 'Organização', 'unidade', 1, 'opcional', false, false, false, false, null, 16),
  ('D', 'Saleiro', 'Mesa', 'unidade', 1, 'opcional', false, false, false, false, null, 17),
  ('D', 'Pimenteiro', 'Mesa', 'unidade', 1, 'opcional', false, false, false, false, null, 18),
  ('D', 'Açucareiro', 'Mesa', 'unidade', 1, 'opcional', false, false, false, false, null, 19),
  ('D', 'Manteigueira', 'Mesa', 'unidade', 1, 'opcional', false, false, false, false, null, 20),
  ('D', 'Potes herméticos para mantimentos', 'Armazenamento', 'conjunto', 1, 'essencial', false, false, false, false, null, 21),
  ('D', 'Potes para guardar alimentos', 'Armazenamento', 'unidade', 8, 'essencial', false, false, false, false, null, 22),
  ('D', 'Formas de gelo', 'Armazenamento', 'unidade', 2, 'opcional', false, false, false, false, null, 23),
  ('E', 'Geladeira', 'Grandes', 'unidade', 1, 'essencial', false, false, false, false, null, 1),
  ('E', 'Fogão ou cooktop', 'Grandes', 'unidade', 1, 'essencial', false, false, false, false, null, 2),
  ('E', 'Forno, se não estiver integrado', 'Grandes', 'unidade', 1, 'opcional', true, false, false, false, 'Depende da estrutura da residência — confirme a necessidade antes de comprar.', 3),
  ('E', 'Micro-ondas', 'Grandes', 'unidade', 1, 'importante', false, false, false, false, null, 4),
  ('E', 'Liquidificador', 'Portáteis', 'unidade', 1, 'importante', false, false, false, false, null, 5),
  ('E', 'Cafeteira ou filtro de café', 'Portáteis', 'unidade', 1, 'opcional', false, false, false, false, 'Conforme a preferência do casal.', 6),
  ('E', 'Air fryer', 'Portáteis', 'unidade', 1, 'opcional', false, false, false, false, null, 7),
  ('E', 'Sanduicheira', 'Portáteis', 'unidade', 1, 'opcional', false, false, false, false, null, 8),
  ('E', 'Batedeira', 'Portáteis', 'unidade', 1, 'opcional', false, false, false, false, null, 9),
  ('E', 'Mixer', 'Portáteis', 'unidade', 1, 'opcional', false, false, false, false, null, 10),
  ('E', 'Purificador ou filtro de água', 'Água', 'unidade', 1, 'essencial', false, false, false, false, null, 11),
  ('E', 'Coifa ou depurador', 'Grandes', 'unidade', 1, 'opcional', true, false, false, false, 'Depende da estrutura da residência — confirme a necessidade antes de comprar.', 12),
  ('F', 'Máquina de lavar roupa', 'Equipamentos', 'unidade', 1, 'essencial', false, false, false, false, null, 1),
  ('F', 'Varal', 'Equipamentos', 'unidade', 1, 'essencial', false, false, false, false, null, 2),
  ('F', 'Cesto de roupas', 'Organização', 'unidade', 1, 'essencial', false, false, false, false, null, 3),
  ('F', 'Balde', 'Utensílios', 'unidade', 1, 'essencial', false, false, false, false, null, 4),
  ('F', 'Bacia', 'Utensílios', 'unidade', 1, 'opcional', false, false, false, false, null, 5),
  ('F', 'Vassoura', 'Utensílios', 'unidade', 1, 'essencial', false, false, false, false, null, 6),
  ('F', 'Rodo', 'Utensílios', 'unidade', 1, 'essencial', false, false, false, false, null, 7),
  ('F', 'Pá de lixo', 'Utensílios', 'unidade', 1, 'essencial', false, false, false, false, null, 8),
  ('F', 'Mop ou esfregão', 'Utensílios', 'unidade', 1, 'opcional', false, false, false, false, null, 9),
  ('F', 'Panos de chão', 'Panos', 'unidade', 4, 'essencial', false, false, false, false, null, 10),
  ('F', 'Panos de limpeza', 'Panos', 'unidade', 8, 'essencial', false, false, false, false, null, 11),
  ('F', 'Panos de prato', 'Panos', 'unidade', 4, 'essencial', false, false, false, false, null, 12),
  ('F', 'Esponjas de louça', 'Panos', 'unidade', 2, 'essencial', false, false, false, false, null, 13),
  ('F', 'Escova de limpeza', 'Utensílios', 'unidade', 1, 'essencial', false, false, false, false, null, 14),
  ('F', 'Escova para roupas', 'Utensílios', 'unidade', 1, 'opcional', false, false, false, false, null, 15),
  ('F', 'Luvas de limpeza', 'Proteção', 'par', 1, 'essencial', false, false, false, false, null, 16),
  ('F', 'Tábua de passar roupa', 'Equipamentos', 'unidade', 1, 'opcional', false, false, false, false, null, 17),
  ('F', 'Ferro de passar ou vaporizador', 'Equipamentos', 'unidade', 1, 'opcional', false, false, false, false, null, 18),
  ('F', 'Aspirador de pó', 'Equipamentos', 'unidade', 1, 'opcional', false, false, false, false, null, 19),
  ('F', 'Pregadores de roupa', 'Organização', 'unidade', 24, 'essencial', false, false, false, false, null, 20),
  ('F', 'Organizador para produtos de limpeza', 'Organização', 'unidade', 1, 'opcional', false, false, false, false, null, 21),
  ('F', 'Sacos de lixo variados', 'Consumíveis', 'lote', 1, 'essencial', false, false, false, false, null, 22),
  ('G', 'Detergente', 'Louças', 'unidade', 2, 'essencial', false, false, false, false, null, 1),
  ('G', 'Sabão para roupas', 'Roupas', 'embalagem', 1, 'essencial', false, false, false, false, null, 2),
  ('G', 'Amaciante', 'Roupas', 'embalagem', 1, 'opcional', false, false, false, false, null, 3),
  ('G', 'Desinfetante', 'Geral', 'unidade', 1, 'essencial', false, false, false, false, null, 4),
  ('G', 'Limpador multiuso', 'Geral', 'unidade', 1, 'essencial', false, false, false, false, null, 5),
  ('G', 'Limpador de banheiro', 'Banheiro', 'unidade', 1, 'essencial', false, false, false, false, null, 6),
  ('G', 'Água sanitária', 'Geral', 'unidade', 1, 'opcional', false, false, false, false, null, 7),
  ('G', 'Álcool para limpeza, quando apropriado', 'Geral', 'unidade', 1, 'opcional', false, false, false, false, null, 8),
  ('G', 'Sabão em barra', 'Roupas', 'embalagem', 1, 'opcional', false, false, false, false, null, 9),
  ('G', 'Papel-toalha', 'Consumíveis', 'pacote', 1, 'opcional', false, false, false, false, null, 10),
  ('H', 'Sofá de 2 ou 3 lugares', 'Mobiliário', 'unidade', 1, 'essencial', false, false, false, false, null, 1),
  ('H', 'Rack ou painel para TV', 'Mobiliário', 'unidade', 1, 'importante', false, false, false, false, null, 2),
  ('H', 'Televisão', 'Eletrônicos', 'unidade', 1, 'opcional', false, false, false, false, null, 3),
  ('H', 'Mesa de centro ou lateral', 'Mobiliário', 'unidade', 1, 'opcional', false, false, false, false, null, 4),
  ('H', 'Tapete para sala', 'Decoração', 'unidade', 1, 'opcional', false, false, false, false, null, 5),
  ('H', 'Cortinas', 'Cortinas', 'conjunto', 1, 'essencial', false, false, false, false, null, 6),
  ('H', 'Almofadas decorativas', 'Decoração', 'unidade', 4, 'opcional', false, false, false, false, null, 7),
  ('H', 'Manta para sofá', 'Decoração', 'unidade', 1, 'opcional', false, false, false, false, null, 8),
  ('H', 'Luminária decorativa', 'Iluminação', 'unidade', 1, 'opcional', false, false, false, false, null, 9),
  ('H', 'Plantas ou objetos decorativos', 'Decoração', 'conjunto', 1, 'opcional', false, false, false, false, null, 10),
  ('H', 'Filtro de linha adequado', 'Eletrônicos', 'unidade', 1, 'essencial', false, false, false, false, null, 11),
  ('I', 'Mesa de jantar', 'Mobiliário', 'unidade', 1, 'essencial', false, false, false, false, null, 1),
  ('I', 'Cadeiras', 'Mobiliário', 'unidade', 4, 'essencial', false, false, false, false, null, 2),
  ('I', 'Cadeiras extras', 'Mobiliário', 'unidade', 2, 'opcional', false, false, false, false, null, 3),
  ('I', 'Toalha de mesa', 'Mesa posta', 'unidade', 1, 'opcional', false, false, false, false, null, 4),
  ('I', 'Jogos americanos', 'Mesa posta', 'unidade', 6, 'opcional', false, false, false, false, null, 5),
  ('I', 'Guardanapos de tecido', 'Mesa posta', 'unidade', 6, 'opcional', false, false, false, false, null, 6),
  ('I', 'Descansos para copos', 'Mesa posta', 'unidade', 6, 'opcional', false, false, false, false, null, 7),
  ('I', 'Bandeja', 'Servir', 'unidade', 1, 'opcional', false, false, false, false, null, 8),
  ('I', 'Taças', 'Copos e taças', 'unidade', 4, 'opcional', false, false, false, false, null, 9),
  ('I', 'Copos extras', 'Copos e taças', 'unidade', 4, 'opcional', false, false, false, false, null, 10),
  ('I', 'Travessa grande', 'Servir', 'unidade', 1, 'opcional', false, false, false, false, null, 11),
  ('J', 'Caixas organizadoras', 'Armários', 'unidade', 3, 'opcional', false, false, false, false, null, 1),
  ('J', 'Cestos para armários', 'Armários', 'unidade', 3, 'opcional', false, false, false, false, null, 2),
  ('J', 'Organizadores de gaveta', 'Gavetas', 'unidade', 2, 'opcional', false, false, false, false, null, 3),
  ('J', 'Sapateira', 'Armários', 'unidade', 1, 'opcional', true, false, false, false, 'Depende da estrutura da residência — confirme a necessidade antes de comprar.', 4),
  ('J', 'Prateleiras', 'Parede', 'conjunto', 1, 'opcional', true, false, false, false, 'Depende da estrutura da residência — confirme a necessidade antes de comprar.', 5),
  ('J', 'Ganchos', 'Parede', 'conjunto', 1, 'essencial', false, false, false, false, null, 6),
  ('J', 'Pasta para documentos e garantias', 'Documentos', 'unidade', 1, 'essencial', false, false, false, false, null, 7),
  ('J', 'Organizadores para cabos', 'Eletrônicos', 'conjunto', 1, 'opcional', false, false, false, false, null, 8),
  ('J', 'Lixeira para cozinha', 'Lixeiras', 'unidade', 1, 'essencial', false, false, false, false, null, 9),
  ('J', 'Lixeira para área de serviço', 'Lixeiras', 'unidade', 1, 'essencial', false, false, false, false, null, 10),
  ('K', 'Caixa de ferramentas', 'Ferramentas', 'unidade', 1, 'essencial', false, false, false, false, null, 1),
  ('K', 'Jogo de chaves Phillips e de fenda', 'Ferramentas', 'jogo', 1, 'essencial', false, false, false, false, null, 2),
  ('K', 'Alicate universal', 'Ferramentas', 'unidade', 1, 'essencial', false, false, false, false, null, 3),
  ('K', 'Martelo', 'Ferramentas', 'unidade', 1, 'essencial', false, false, false, false, null, 4),
  ('K', 'Trena', 'Medição', 'unidade', 1, 'essencial', false, false, false, false, null, 5),
  ('K', 'Nível', 'Medição', 'unidade', 1, 'opcional', false, false, false, false, null, 6),
  ('K', 'Jogo de chaves Allen', 'Ferramentas', 'jogo', 1, 'opcional', false, false, false, false, null, 7),
  ('K', 'Parafusos e buchas variados', 'Fixação', 'conjunto', 1, 'opcional', false, false, false, false, null, 8),
  ('K', 'Fita isolante', 'Fixação', 'unidade', 1, 'essencial', false, false, false, false, null, 9),
  ('K', 'Fita veda-rosca', 'Fixação', 'unidade', 1, 'essencial', false, false, false, false, null, 10),
  ('K', 'Lanterna', 'Emergência', 'unidade', 1, 'essencial', false, false, false, false, null, 11),
  ('K', 'Pilhas compatíveis', 'Emergência', 'lote', 1, 'opcional', true, false, false, false, 'Depende da estrutura da residência — confirme a necessidade antes de comprar.', 12),
  ('K', 'Lâmpadas de reposição', 'Elétrica', 'unidade', 2, 'opcional', true, false, false, false, 'Depende da estrutura da residência — confirme a necessidade antes de comprar.', 13),
  ('K', 'Escadinha doméstica', 'Ferramentas', 'unidade', 1, 'opcional', false, false, false, false, null, 14),
  ('K', 'Kit básico de primeiros socorros', 'Emergência', 'unidade', 1, 'essencial', false, false, false, false, null, 15),
  ('L', 'Conferir fechaduras e cópias de chaves', 'Verificações', 'tarefa', 1, 'essencial', false, true, false, false, null, 1),
  ('L', 'Verificar detectores de fumaça, quando aplicável', 'Verificações', 'tarefa', 1, 'opcional', true, true, false, false, 'Depende da estrutura da residência — confirme a necessidade antes de comprar.', 2),
  ('L', 'Conferir tomadas, aterramento e disjuntores', 'Verificações', 'tarefa', 1, 'essencial', false, true, false, false, null, 3),
  ('L', 'Verificar torneiras e possíveis vazamentos', 'Verificações', 'tarefa', 1, 'essencial', false, true, false, false, null, 4),
  ('L', 'Conferir funcionamento dos chuveiros', 'Verificações', 'tarefa', 1, 'essencial', false, true, false, false, null, 5),
  ('L', 'Separar contatos de emergência e manutenção', 'Verificações', 'tarefa', 1, 'essencial', false, true, false, false, null, 6),
  ('M', 'Escovas de dentes', 'Bucal', 'unidade', 2, 'essencial', false, false, false, false, null, 1),
  ('M', 'Sabonetes', 'Banho', 'unidade', 2, 'essencial', false, false, false, false, 'Ajuste a quantidade conforme o consumo do casal.', 2),
  ('M', 'Shampoo e condicionador', 'Banho', 'lote', 1, 'essencial', false, false, false, false, null, 3),
  ('M', 'Desodorantes', 'Cuidados diários', 'unidade', 2, 'essencial', false, false, false, false, null, 4),
  ('M', 'Creme dental', 'Bucal', 'unidade', 1, 'essencial', false, false, false, false, null, 5),
  ('M', 'Fio dental', 'Bucal', 'unidade', 1, 'essencial', false, false, false, false, null, 6),
  ('M', 'Algodão e cotonetes', 'Cuidados diários', 'lote', 1, 'opcional', false, false, false, false, null, 7),
  ('M', 'Produtos pessoais de uso habitual', 'Cuidados diários', 'lote', 1, 'essencial', false, false, false, false, null, 8),
  ('M', 'Medicamentos de uso habitual, se houver', 'Saúde', 'lote', 1, 'opcional', true, false, false, true, 'Depende da estrutura da residência — confirme a necessidade antes de comprar.', 9),
  ('N', 'Café', 'Mercearia', 'pacote', 1, 'opcional', false, false, true, false, 'Conforme a preferência do casal.', 1),
  ('N', 'Açúcar ou adoçante', 'Mercearia', 'embalagem', 1, 'opcional', false, false, true, false, 'Conforme a preferência do casal.', 2),
  ('N', 'Sal', 'Mercearia', 'pacote', 1, 'essencial', false, false, true, false, null, 3),
  ('N', 'Óleo ou azeite', 'Mercearia', 'unidade', 1, 'essencial', false, false, true, false, null, 4),
  ('N', 'Arroz', 'Mercearia', 'pacote', 1, 'essencial', false, false, true, false, null, 5),
  ('N', 'Feijão', 'Mercearia', 'pacote', 1, 'essencial', false, false, true, false, null, 6),
  ('N', 'Macarrão', 'Mercearia', 'pacote', 2, 'essencial', false, false, true, false, null, 7),
  ('N', 'Farinha e ingredientes habituais', 'Mercearia', 'lote', 1, 'opcional', false, false, true, false, 'Conforme a preferência do casal.', 8),
  ('N', 'Temperos básicos', 'Mercearia', 'lote', 1, 'essencial', false, false, true, false, null, 9),
  ('N', 'Leite', 'Perecíveis', 'lote', 1, 'importante', false, false, true, false, 'Ajuste a quantidade conforme o consumo do casal.', 10),
  ('N', 'Ovos', 'Perecíveis', 'embalagem', 1, 'importante', false, false, true, false, 'Ajuste a quantidade conforme o consumo do casal.', 11),
  ('N', 'Pão', 'Perecíveis', 'lote', 1, 'importante', false, false, true, false, 'Ajuste a quantidade conforme o consumo do casal.', 12),
  ('N', 'Manteiga ou margarina', 'Perecíveis', 'unidade', 1, 'opcional', false, false, true, false, 'Conforme a preferência do casal.', 13),
  ('N', 'Água potável', 'Bebidas', 'lote', 1, 'essencial', false, false, true, false, null, 14),
  ('N', 'Alimentos para as primeiras refeições', 'Perecíveis', 'lote', 1, 'essencial', false, false, true, false, null, 15);
