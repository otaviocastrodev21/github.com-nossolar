-- Comparativo de preços: cotações de um item em lojas ou sites diferentes.
--
-- Cada linha é uma oferta encontrada pelo casal: onde, quanto, o frete e o
-- link. A mais barata (preço + frete) é destacada no aplicativo. Nada aqui é
-- buscado sozinho na internet — as lojas não oferecem isso de forma aberta,
-- e os itens são genéricos ("Colchão") até o casal escolher um modelo.

create table if not exists public.item_quotes (
  id          uuid primary key default gen_random_uuid(),
  space_id    uuid not null references public.spaces (id) on delete cascade,
  item_id     uuid not null references public.items (id) on delete cascade,
  store       text not null check (length(btrim(store)) between 1 and 80),
  price       numeric(14, 2) not null check (price >= 0),
  shipping    numeric(14, 2) not null default 0 check (shipping >= 0),
  url         text check (url is null or length(url) <= 2000),
  notes       text check (notes is null or length(notes) <= 300),
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists item_quotes_item_idx on public.item_quotes (item_id, (price + shipping));
create index if not exists item_quotes_space_idx on public.item_quotes (space_id);

comment on table public.item_quotes is
  'Cotações de um item em lojas diferentes. Preço final = price + shipping.';

-- A cotação tem de ser de um item do mesmo espaço: sem isso, quem está num
-- espaço poderia pendurar cotações em itens de outro.
create or replace function public.assert_quote_item_in_space()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.items i where i.id = new.item_id and i.space_id = new.space_id
  ) then
    raise exception 'O item da cotação não pertence a este espaço.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_quotes_00_item on public.item_quotes;
create trigger trg_quotes_00_item
  before insert or update of item_id, space_id on public.item_quotes
  for each row execute function public.assert_quote_item_in_space();

drop trigger if exists trg_quotes_01_touch on public.item_quotes;
create trigger trg_quotes_01_touch
  before update on public.item_quotes
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_quotes_30_log on public.item_quotes;
create trigger trg_quotes_30_log
  after insert or update or delete on public.item_quotes
  for each row execute function public.log_change('Cotação');

-- ─────────────────────────────── Acesso ────────────────────────────────────
alter table public.item_quotes enable row level security;

drop policy if exists item_quotes_select on public.item_quotes;
create policy item_quotes_select on public.item_quotes for select to authenticated
  using (public.is_space_member(space_id));

drop policy if exists item_quotes_insert on public.item_quotes;
create policy item_quotes_insert on public.item_quotes for insert to authenticated
  with check (public.is_space_member(space_id));

drop policy if exists item_quotes_update on public.item_quotes;
create policy item_quotes_update on public.item_quotes for update to authenticated
  using (public.is_space_member(space_id))
  with check (public.is_space_member(space_id));

drop policy if exists item_quotes_delete on public.item_quotes;
create policy item_quotes_delete on public.item_quotes for delete to authenticated
  using (public.is_space_member(space_id));

revoke all on public.item_quotes from anon, authenticated;
grant select, insert, update, delete on public.item_quotes to authenticated;

-- ───────────────────────────── Tempo real ──────────────────────────────────
do $$
begin
  alter publication supabase_realtime add table public.item_quotes;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;
