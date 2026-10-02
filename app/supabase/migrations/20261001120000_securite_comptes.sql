-- Sécurité des comptes : rattachement à un établissement uniquement par code d'invitation, rôles
-- admin/membre, et impossibilité pour un utilisateur de changer lui-même d'établissement.

-- 1. Rôles (créés en premier : la fonction SQL est_admin() ci-dessous référence cette colonne, et
--    Postgres vérifie le corps des fonctions SQL dès leur création)
alter table public.profiles
  add column if not exists role text not null default 'membre' check (role in ('admin', 'membre'));

-- 2. Fonctions utilitaires (security definer : lisent `profiles` sans repasser par ses propres règles RLS,
--    ce qui évite une récursion infinie dans la politique de lecture de `profiles`).
create or replace function public.mon_etablissement_id()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select etablissement_id from public.profiles where id = auth.uid()
$$;

create or replace function public.est_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false)
$$;

-- Code d'invitation : 10 caractères tirés d'un alphabet sans caractères ambigus (pas de 0/O, 1/I),
-- générés avec un aléa cryptographique (32 symboles, 256 % 32 = 0 → tirage uniforme).
create or replace function public.generer_code_invitation()
returns text
language plpgsql volatile set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  octets bytea := extensions.gen_random_bytes(10);
  code text := '';
begin
  for i in 0..9 loop
    code := code || substr(alphabet, 1 + (get_byte(octets, i) % 32), 1);
  end loop;
  return code;
end;
$$;

-- 3. Établissement : code d'invitation, créateur, informations d'en-tête des documents officiels
alter table public.etablissements
  add column if not exists code_invitation text,
  add column if not exists created_by uuid references auth.users (id) on delete set null,
  add column if not exists code_etablissement text,
  add column if not exists statut text,
  add column if not exists drena text,
  add column if not exists ministere text,
  add column if not exists adresse text,
  add column if not exists telephone text,
  add column if not exists email text,
  add column if not exists annee_scolaire text,
  add column if not exists signataire_nom text,
  add column if not exists signataire_titre text;

update public.etablissements set code_invitation = public.generer_code_invitation() where code_invitation is null;

alter table public.etablissements
  alter column code_invitation set default public.generer_code_invitation(),
  alter column code_invitation set not null;
alter table public.etablissements add constraint etablissements_code_invitation_key unique (code_invitation);

-- Comptes existants : le plus ancien membre de chaque établissement en devient l'administrateur.
update public.profiles p
set role = 'admin'
where p.etablissement_id is not null
  and p.id = (
    select p2.id from public.profiles p2
    where p2.etablissement_id = p.etablissement_id
    order by p2.created_at
    limit 1
  );

update public.etablissements e
set created_by = (
  select p.id from public.profiles p
  where p.etablissement_id = e.id and p.role = 'admin'
  order by p.created_at
  limit 1
)
where e.created_by is null;

-- 4. Inscription : soit on crée un NOUVEL établissement (dont on devient admin), soit on rejoint un
--    établissement existant avec son code d'invitation. Plus aucun rattachement par simple nom.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = 'public'
as $$
declare
  v_code text;
  v_nom text;
  v_etablissement_id uuid;
  v_role text;
begin
  v_code := nullif(regexp_replace(upper(coalesce(new.raw_user_meta_data ->> 'code_invitation', '')), '[^A-Z0-9]', '', 'g'), '');

  if v_code is not null then
    select id into v_etablissement_id from public.etablissements where code_invitation = v_code;
    if v_etablissement_id is null then
      raise exception 'Code d''invitation invalide.';
    end if;
    v_role := 'membre';
  else
    v_nom := nullif(trim(new.raw_user_meta_data ->> 'etablissement_name'), '');
    if v_nom is null then
      raise exception 'Nom d''établissement requis.';
    end if;
    if exists (select 1 from public.etablissements where lower(name) = lower(v_nom)) then
      raise exception 'Cet établissement existe déjà : demande un code d''invitation à son administrateur.';
    end if;
    insert into public.etablissements (name, created_by) values (v_nom, new.id) returning id into v_etablissement_id;
    v_role := 'admin';
  end if;

  insert into public.profiles (id, email, first_name, last_name, full_name, etablissement_id, role)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'first_name',
    new.raw_user_meta_data ->> 'last_name',
    trim(concat(new.raw_user_meta_data ->> 'first_name', ' ', new.raw_user_meta_data ->> 'last_name')),
    v_etablissement_id,
    v_role
  );
  return new;
end;
$$;

-- 5. Vérifications avant inscription (appelables sans être connecté) : le trigger ci-dessus refuse déjà
--    les cas invalides, mais Supabase Auth ne renvoie alors qu'un message générique — ces deux fonctions
--    permettent d'afficher un message clair dans le formulaire.
create or replace function public.verifier_code_invitation(p_code text)
returns text
language sql stable security definer set search_path = ''
as $$
  select name from public.etablissements
  where code_invitation = nullif(regexp_replace(upper(coalesce(p_code, '')), '[^A-Z0-9]', '', 'g'), '')
$$;

create or replace function public.etablissement_nom_disponible(p_nom text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select not exists (select 1 from public.etablissements where lower(name) = lower(trim(p_nom)))
$$;

-- 6. Administration des membres (réservée aux admins de l'établissement)
create or replace function public.regenerer_code_invitation()
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_code text;
begin
  if not public.est_admin() then
    raise exception 'Réservé à l''administrateur de l''établissement.';
  end if;
  v_code := public.generer_code_invitation();
  update public.etablissements set code_invitation = v_code where id = public.mon_etablissement_id();
  return v_code;
end;
$$;

create or replace function public.retirer_membre(p_user_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.est_admin() then
    raise exception 'Réservé à l''administrateur de l''établissement.';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'Tu ne peux pas te retirer toi-même.';
  end if;
  update public.profiles
  set etablissement_id = null, role = 'membre'
  where id = p_user_id and etablissement_id = public.mon_etablissement_id();
end;
$$;

create or replace function public.definir_role_membre(p_user_id uuid, p_role text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.est_admin() then
    raise exception 'Réservé à l''administrateur de l''établissement.';
  end if;
  if p_role not in ('admin', 'membre') then
    raise exception 'Rôle inconnu.';
  end if;
  if p_role = 'membre' and p_user_id = auth.uid() and (
    select count(*) from public.profiles
    where etablissement_id = public.mon_etablissement_id() and role = 'admin'
  ) <= 1 then
    raise exception 'L''établissement doit garder au moins un administrateur.';
  end if;
  update public.profiles
  set role = p_role
  where id = p_user_id and etablissement_id = public.mon_etablissement_id();
end;
$$;

-- 7. Règles d'accès
drop policy if exists "Tout le monde peut lister les établissements" on public.etablissements;
create policy "Lecture de son établissement" on public.etablissements
  for select to authenticated using (id = public.mon_etablissement_id());
create policy "Modification de son établissement par un admin" on public.etablissements
  for update to authenticated
  using (id = public.mon_etablissement_id() and public.est_admin())
  with check (id = public.mon_etablissement_id() and public.est_admin());

drop policy if exists "Un utilisateur peut lire son propre profil" on public.profiles;
create policy "Lecture de son profil et des membres de son établissement" on public.profiles
  for select to authenticated
  using (id = auth.uid() or etablissement_id = public.mon_etablissement_id());

-- Colonnes modifiables : un utilisateur ne peut changer que son nom (jamais son établissement ni son
-- rôle) ; un admin ne peut changer que les informations de l'établissement (jamais son code d'invitation,
-- qui passe par `regenerer_code_invitation`).
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (first_name, last_name, full_name) on public.profiles to authenticated;

revoke insert, update, delete on public.etablissements from anon, authenticated;
grant update (
  name, code_etablissement, statut, drena, ministere, adresse, telephone, email, annee_scolaire,
  signataire_nom, signataire_titre
) on public.etablissements to authenticated;

-- 8. Droits d'exécution des fonctions
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.generer_code_invitation() from public, anon, authenticated;
revoke execute on function public.regenerer_code_invitation() from public, anon;
revoke execute on function public.retirer_membre(uuid) from public, anon;
revoke execute on function public.definir_role_membre(uuid, text) from public, anon;
grant execute on function public.regenerer_code_invitation() to authenticated;
grant execute on function public.retirer_membre(uuid) to authenticated;
grant execute on function public.definir_role_membre(uuid, text) to authenticated;
grant execute on function public.verifier_code_invitation(text) to anon, authenticated;
grant execute on function public.etablissement_nom_disponible(text) to anon, authenticated;
