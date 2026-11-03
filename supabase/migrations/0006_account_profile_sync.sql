-- Conta com e-mail e senha.
--
-- Uma sessão anônima antiga vira conta por `updateUser` (UPDATE em
-- auth.users, não INSERT), então o gatilho de criação não roda e o perfil
-- ficava sem e-mail e como "Participante". O cliente não pode gravar o
-- e-mail no perfil (a permissão por coluna só libera o nome), e é melhor
-- assim: quem diz qual é o e-mail é o Auth.

create or replace function public.handle_user_updated()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  nome text := nullif(btrim(new.raw_user_meta_data ->> 'display_name'), '');
begin
  update public.profiles
     set email = new.email,
         -- o nome do cadastro só preenche quem ainda não tinha nome
         display_name = case
           when nome is not null and btrim(display_name) in ('', 'Participante') then nome
           else display_name
         end,
         updated_at = now()
   where id = new.id
     and (email is distinct from new.email
          or (nome is not null and btrim(display_name) in ('', 'Participante')));
  return new;
end;
$$;

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
  after update of email, raw_user_meta_data on auth.users
  for each row execute function public.handle_user_updated();
