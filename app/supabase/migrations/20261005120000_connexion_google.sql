-- Connexion avec Google : Google ne transmet ni établissement ni code d'invitation à l'inscription. Le compte
-- est donc créé sans établissement, puis l'utilisateur complète son profil (page /completer-profil) via
-- `completer_inscription`. L'inscription par email reste inchangée (établissement ou code obligatoire).

-- 1. Inscription : un compte venant d'un fournisseur externe (Google) peut être créé sans établissement.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = 'public'
as $$
declare
  v_code text;
  v_nom text;
  v_etablissement_id uuid;
  v_role text := 'membre';
  v_first_name text;
  v_last_name text;
begin
  v_code := nullif(regexp_replace(upper(coalesce(new.raw_user_meta_data ->> 'code_invitation', '')), '[^A-Z0-9]', '', 'g'), '');
  v_nom := nullif(trim(new.raw_user_meta_data ->> 'etablissement_name'), '');

  if v_code is not null then
    select id into v_etablissement_id from public.etablissements where code_invitation = v_code;
    if v_etablissement_id is null then
      raise exception 'Code d''invitation invalide.';
    end if;
  elsif v_nom is not null then
    if exists (select 1 from public.etablissements where lower(name) = lower(v_nom)) then
      raise exception 'Cet établissement existe déjà : demande un code d''invitation à son administrateur.';
    end if;
    insert into public.etablissements (name, created_by) values (v_nom, new.id) returning id into v_etablissement_id;
    v_role := 'admin';
  elsif coalesce(new.raw_app_meta_data ->> 'provider', 'email') = 'email' then
    raise exception 'Nom d''établissement requis.';
  end if;

  -- Google fournit given_name / family_name (et name) au lieu de first_name / last_name
  v_first_name := coalesce(new.raw_user_meta_data ->> 'first_name', new.raw_user_meta_data ->> 'given_name');
  v_last_name := coalesce(new.raw_user_meta_data ->> 'last_name', new.raw_user_meta_data ->> 'family_name');

  insert into public.profiles (id, email, first_name, last_name, full_name, etablissement_id, role)
  values (
    new.id,
    new.email,
    v_first_name,
    v_last_name,
    coalesce(nullif(trim(concat(v_first_name, ' ', v_last_name)), ''), new.raw_user_meta_data ->> 'name'),
    v_etablissement_id,
    v_role
  );
  return new;
end;
$$;

-- 2. Fin d'inscription pour un compte sans établissement : soit créer un nouvel établissement (on en devient
--    admin), soit rejoindre un établissement existant avec son code d'invitation.
create or replace function public.completer_inscription(
  p_first_name text,
  p_last_name text,
  p_etablissement text default null,
  p_code_invitation text default null
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_code text;
  v_nom text;
  v_etablissement_id uuid;
  v_role text;
begin
  if auth.uid() is null then
    raise exception 'Connexion requise.';
  end if;
  if (select etablissement_id from public.profiles where id = auth.uid()) is not null then
    raise exception 'Ton compte est déjà rattaché à un établissement.';
  end if;
  if nullif(trim(p_first_name), '') is null or nullif(trim(p_last_name), '') is null then
    raise exception 'Prénom et nom requis.';
  end if;

  v_code := nullif(regexp_replace(upper(coalesce(p_code_invitation, '')), '[^A-Z0-9]', '', 'g'), '');
  if v_code is not null then
    select id into v_etablissement_id from public.etablissements where code_invitation = v_code;
    if v_etablissement_id is null then
      raise exception 'Code d''invitation invalide.';
    end if;
    v_role := 'membre';
  else
    v_nom := nullif(trim(p_etablissement), '');
    if v_nom is null then
      raise exception 'Nom d''établissement requis.';
    end if;
    if exists (select 1 from public.etablissements where lower(name) = lower(v_nom)) then
      raise exception 'Cet établissement existe déjà : demande un code d''invitation à son administrateur.';
    end if;
    insert into public.etablissements (name, created_by) values (v_nom, auth.uid()) returning id into v_etablissement_id;
    v_role := 'admin';
  end if;

  update public.profiles
  set first_name = trim(p_first_name),
      last_name = trim(p_last_name),
      full_name = trim(p_first_name) || ' ' || trim(p_last_name),
      etablissement_id = v_etablissement_id,
      role = v_role
  where id = auth.uid();
end;
$$;

revoke execute on function public.completer_inscription(text, text, text, text) from public, anon;
grant execute on function public.completer_inscription(text, text, text, text) to authenticated;
