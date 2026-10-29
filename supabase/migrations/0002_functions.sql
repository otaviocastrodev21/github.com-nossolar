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
