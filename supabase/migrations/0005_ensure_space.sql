-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  0005 · O espaço do primeiro uso                                          ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝
--
-- Não existe tela de boas-vindas: quem abre o aplicativo cai no painel. O
-- espaço, portanto, precisa nascer sozinho — e exatamente uma vez.
--
-- O cliente não pode garantir isso por conta própria. Duas abas abertas no
-- primeiro uso (ou o efeito que roda duas vezes no modo estrito do React)
-- chamariam `create_space` em paralelo, cada uma vendo "nenhum espaço ainda",
-- e o casal terminaria com duas listas de 208 linhas sem saber qual é a boa.
--
-- A trava fica aqui, onde é possível serializar de verdade: um lock de
-- transação por usuário. Quem chega primeiro cria; quem chega depois espera,
-- reconsulta e recebe o mesmo espaço.

create or replace function public.ensure_space()
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

  -- Serializa por usuário. Duas chamadas simultâneas do mesmo aparelho entram
  -- em fila; usuários diferentes não se estorvam. O lock cai sozinho no fim
  -- da transação, não há o que liberar à mão.
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));

  -- Já participa de algum espaço? Devolve o mais antigo e não cria nada. Vale
  -- também para quem entrou por código: o espaço do outro conta.
  select sm.space_id
    into v_space
    from public.space_members sm
    join public.spaces s on s.id = sm.space_id
   where sm.user_id = v_uid
   order by s.created_at, s.id
   limit 1;

  if v_space is not null then
    return v_space;
  end if;

  -- Primeiro uso de verdade: cria com a lista inicial do enxoval.
  return public.create_space('Nosso Lar');
end;
$$;

comment on function public.ensure_space() is
  'Devolve o espaço do usuário, criando-o na primeira vez. Serializado por '
  'lock de transação: chamadas simultâneas não geram espaços duplicados.';

revoke all on function public.ensure_space() from public;
grant execute on function public.ensure_space() to authenticated;
