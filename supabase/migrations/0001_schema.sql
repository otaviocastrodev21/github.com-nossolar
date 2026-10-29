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
