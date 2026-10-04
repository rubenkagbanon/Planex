-- 1. Succession de l'administrateur : quand le compte du dernier administrateur d'un établissement disparaît
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

-- 2. Suppression de toutes les données créées pour l'établissement (administrateur seulement) : paramétrage
-- (classes, professeurs, salles, horaires, grille, règles, regroupements, indisponibilités), emploi du
-- temps, versions et rapports — et, si demandé, la bibliothèque des années. L'établissement (en-tête,
-- code d'invitation) et les comptes de ses membres sont conservés. Tout ou rien : une seule transaction.
create or replace function public.supprimer_donnees_etablissement(p_avec_bibliotheque boolean default false)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_etab uuid := public.mon_etablissement_id();
begin
  if v_etab is null then
    raise exception 'Établissement introuvable pour ce compte.';
  end if;
  if not public.est_admin() then
    raise exception 'Seul l''administrateur de l''établissement peut supprimer ses données.';
  end if;
  delete from public.emploi_du_temps where etablissement_id = v_etab;
  delete from public.emploi_du_temps_versions where etablissement_id = v_etab;
  delete from public.generations where etablissement_id = v_etab;
  delete from public.professeur_indisponibilites where etablissement_id = v_etab;
  delete from public.regroupements where etablissement_id = v_etab;
  delete from public.classes_details where etablissement_id = v_etab;
  delete from public.classes_etablissement where etablissement_id = v_etab;
  delete from public.professeurs where etablissement_id = v_etab;
  delete from public.matieres_salles where etablissement_id = v_etab;
  delete from public.salles where etablissement_id = v_etab;
  delete from public.creneaux_horaires where etablissement_id = v_etab;
  delete from public.horaires_contraintes where etablissement_id = v_etab;
  delete from public.horaires_reference where etablissement_id = v_etab;
  if p_avec_bibliotheque then
    delete from public.annees_archivees where etablissement_id = v_etab;
  end if;
end;
$$;

revoke all on function public.supprimer_donnees_etablissement(boolean) from public, anon;
grant execute on function public.supprimer_donnees_etablissement(boolean) to authenticated;
