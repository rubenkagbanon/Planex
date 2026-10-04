-- Succession de l'administrateur : quand le compte du dernier administrateur d'un établissement disparaît
-- (compte supprimé dans Supabase › Authentication, ce qui supprime sa ligne profiles par cascade), le membre
-- le plus ancien de l'établissement devient administrateur. Un établissement qui a encore des membres ne
-- reste ainsi jamais sans administrateur.

create or replace function public.succession_administrateur()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_successeur uuid;
begin
  if old.role is distinct from 'admin' or old.etablissement_id is null then
    return null;
  end if;
  if exists (select 1 from public.profiles where etablissement_id = old.etablissement_id and role = 'admin') then
    return null;
  end if;
  select id into v_successeur
  from public.profiles
  where etablissement_id = old.etablissement_id
  order by created_at asc, id asc
  limit 1;
  if v_successeur is not null then
    update public.profiles set role = 'admin' where id = v_successeur;
  end if;
  return null;
end;
$$;

revoke all on function public.succession_administrateur() from public, anon, authenticated;

drop trigger if exists profiles_succession_administrateur on public.profiles;
create trigger profiles_succession_administrateur
  after delete on public.profiles
  for each row execute function public.succession_administrateur();
