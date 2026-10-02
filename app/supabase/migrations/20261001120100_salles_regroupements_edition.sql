-- Salles, regroupements (tronc commun / tandem), règles pédagogiques, édition manuelle (verrouillage),
-- versions de l'emploi du temps et rapports de génération.
-- Dépend de 20261001120000_securite_comptes.sql (fonction `mon_etablissement_id`).

-- 1. Salles ---------------------------------------------------------------------------------------------
-- `capacite` = nombre de classes (ou de séances distinctes) que la salle peut accueillir en même temps.
-- En règle générale 1 ; un terrain de sport peut en accueillir plusieurs. Un tronc commun (plusieurs
-- classes réunies pour le même cours) ne compte que pour une seule occupation.
create table public.salles (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements (id) on delete cascade,
  nom text not null,
  type text not null default 'classe' check (type in ('classe', 'laboratoire', 'informatique', 'sport', 'autre')),
  capacite integer not null default 1 check (capacite >= 1),
  created_at timestamptz not null default now(),
  unique (etablissement_id, nom)
);

-- Matières qui exigent un type de salle (ex. S.V.T. → laboratoire, TICE → informatique).
create table public.matieres_salles (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements (id) on delete cascade,
  matiere text not null,
  type_salle text not null check (type_salle in ('classe', 'laboratoire', 'informatique', 'sport', 'autre')),
  unique (etablissement_id, matiere)
);

-- 2. Détail de chaque classe : professeur principal (en-tête des emplois du temps imprimés) et salle
--    attitrée. Table séparée de `classes_etablissement` (qui est réécrite à chaque enregistrement).
create table public.classes_details (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements (id) on delete cascade,
  niveau text not null,
  section integer not null check (section > 0),
  professeur_principal text,
  salle_id uuid references public.salles (id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (etablissement_id, niveau, section)
);

-- 3. Regroupements
--    - tronc_commun : les classes listées suivent ENSEMBLE le cours de la matière (même professeur, même
--      salle, même créneau). `matieres` contient une seule matière.
--    - tandem : chaque classe listée est scindée en groupes qui ont cours EN MÊME TEMPS dans des salles
--      différentes, un groupe par matière de `matieres` (ex. S.V.T. / Physique-Chimie).
create table public.regroupements (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements (id) on delete cascade,
  type text not null check (type in ('tronc_commun', 'tandem')),
  libelle text,
  matieres text[] not null check (cardinality(matieres) >= 1),
  classes text[] not null check (cardinality(classes) >= 1),
  created_at timestamptz not null default now()
);

-- 4. Règles pédagogiques activables, par cycle (structure documentée dans src/lib/regles.ts ; les clés
--    absentes prennent leur valeur par défaut côté application).
alter table public.horaires_contraintes add column regles jsonb not null default '{}'::jsonb;

-- 5. Séances : salle, verrouillage, regroupement ---------------------------------------------------------
-- `groupe_seance` relie les lignes d'une même séance partagée (tronc commun : plusieurs classes ;
-- tandem : plusieurs groupes d'une classe). Ces lignes ont le droit de partager classe, professeur ou
-- salle au même créneau ; toutes les autres non.
alter table public.emploi_du_temps drop column if exists salle;
alter table public.emploi_du_temps
  add column salle_id uuid references public.salles (id) on delete set null,
  add column verrouille boolean not null default false,
  add column groupe_seance uuid;

alter table public.emploi_du_temps drop constraint if exists emploi_du_temps_etablissement_id_jour_creneau_id_niveau_sec_key;
alter table public.emploi_du_temps drop constraint if exists emploi_du_temps_etablissement_id_jour_creneau_id_professeur_key;
create index if not exists emploi_du_temps_creneau_idx on public.emploi_du_temps (etablissement_id, jour, creneau_id);

-- Garde-fou en base, vérifié en fin de transaction (contrainte différée) pour permettre les échanges de
-- séances : aucune classe, aucun professeur sur deux séances distinctes au même créneau, et aucune salle
-- au-delà de sa capacité.
create or replace function public.verifier_conflits_seance()
returns trigger
language plpgsql set search_path = ''
as $$
declare
  v_seance public.emploi_du_temps;
  v_occupations integer;
  v_capacite integer;
begin
  select * into v_seance from public.emploi_du_temps where id = new.id;
  if not found then
    return null;
  end if;

  if exists (
    select 1 from public.emploi_du_temps o
    where o.etablissement_id = v_seance.etablissement_id
      and o.jour = v_seance.jour
      and o.creneau_id = v_seance.creneau_id
      and o.id <> v_seance.id
      and (o.groupe_seance is null or v_seance.groupe_seance is null or o.groupe_seance <> v_seance.groupe_seance)
      and o.niveau = v_seance.niveau and o.section = v_seance.section
  ) then
    raise exception 'Conflit : la classe % % a déjà une séance le % à ce créneau.', v_seance.niveau, v_seance.section, v_seance.jour;
  end if;

  if exists (
    select 1 from public.emploi_du_temps o
    where o.etablissement_id = v_seance.etablissement_id
      and o.jour = v_seance.jour
      and o.creneau_id = v_seance.creneau_id
      and o.id <> v_seance.id
      and (o.groupe_seance is null or v_seance.groupe_seance is null or o.groupe_seance <> v_seance.groupe_seance)
      and o.professeur_id = v_seance.professeur_id
  ) then
    raise exception 'Conflit : ce professeur a déjà une séance le % à ce créneau.', v_seance.jour;
  end if;

  if v_seance.salle_id is not null then
    select count(distinct coalesce(o.groupe_seance, o.id)) into v_occupations
    from public.emploi_du_temps o
    where o.etablissement_id = v_seance.etablissement_id
      and o.jour = v_seance.jour
      and o.creneau_id = v_seance.creneau_id
      and o.salle_id = v_seance.salle_id;
    select capacite into v_capacite from public.salles where id = v_seance.salle_id;
    if v_occupations > coalesce(v_capacite, 1) then
      raise exception 'Conflit : la salle est déjà occupée le % à ce créneau.', v_seance.jour;
    end if;
  end if;

  return null;
end;
$$;

create constraint trigger emploi_du_temps_conflits
  after insert or update on public.emploi_du_temps
  deferrable initially deferred
  for each row execute function public.verifier_conflits_seance();

-- 6. Versions et rapports ----------------------------------------------------------------------------------
-- Une version est un instantané autonome : les séances y sont décrites par nom de professeur, heure de
-- début et nom de salle (pas par identifiant), pour rester restaurables même après modification des fiches
-- professeurs, des créneaux ou des salles.
create table public.emploi_du_temps_versions (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements (id) on delete cascade,
  label text not null,
  nb_seances integer not null default 0,
  seances jsonb not null default '[]'::jsonb,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.generations (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements (id) on delete cascade,
  total_charges integer not null default 0,
  total_placees integer not null default 0,
  nb_verrouillees integer not null default 0,
  warnings jsonb not null default '[]'::jsonb,
  entorses jsonb not null default '[]'::jsonb,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create or replace function public.enregistrer_version(p_label text)
returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  v_etablissement_id uuid := public.mon_etablissement_id();
  v_id uuid;
begin
  if v_etablissement_id is null then
    raise exception 'Établissement introuvable pour ce compte.';
  end if;
  insert into public.emploi_du_temps_versions (etablissement_id, label, nb_seances, seances)
  select
    v_etablissement_id,
    p_label,
    count(*),
    coalesce(jsonb_agg(jsonb_build_object(
      'cycle', e.cycle,
      'jour', e.jour,
      'heure_debut', c.heure_debut::text,
      'niveau', e.niveau,
      'section', e.section,
      'matiere', e.matiere,
      'professeur_nom', p.nom_complet,
      'salle_nom', s.nom,
      'verrouille', e.verrouille,
      'groupe_seance', e.groupe_seance
    )), '[]'::jsonb)
  from public.emploi_du_temps e
  join public.creneaux_horaires c on c.id = e.creneau_id
  join public.professeurs p on p.id = e.professeur_id
  left join public.salles s on s.id = e.salle_id
  where e.etablissement_id = v_etablissement_id
  returning id into v_id;
  return v_id;
end;
$$;

-- Remplace l'emploi du temps actuel par une version enregistrée. Les séances dont le professeur, le
-- créneau ou la salle n'existent plus sont ignorées ; le nombre de séances restaurées est renvoyé.
create or replace function public.restaurer_version(p_version_id uuid)
returns integer
language plpgsql security invoker set search_path = ''
as $$
declare
  v_etablissement_id uuid := public.mon_etablissement_id();
  v_seances jsonb;
  v_count integer;
begin
  select seances into v_seances
  from public.emploi_du_temps_versions
  where id = p_version_id and etablissement_id = v_etablissement_id;
  if v_seances is null then
    raise exception 'Version introuvable.';
  end if;

  delete from public.emploi_du_temps where etablissement_id = v_etablissement_id;

  insert into public.emploi_du_temps (
    etablissement_id, cycle, jour, creneau_id, niveau, section, matiere, professeur_id, salle_id, verrouille, groupe_seance
  )
  select
    v_etablissement_id, s.cycle, s.jour, c.id, s.niveau, s.section, s.matiere, p.id, sa.id,
    coalesce(s.verrouille, false), s.groupe_seance
  from jsonb_to_recordset(v_seances) as s(
    cycle text, jour text, heure_debut text, niveau text, section integer, matiere text,
    professeur_nom text, salle_nom text, verrouille boolean, groupe_seance uuid
  )
  join public.creneaux_horaires c
    on c.etablissement_id = v_etablissement_id and c.cycle = s.cycle and c.heure_debut = s.heure_debut::time
  join lateral (
    select pr.id from public.professeurs pr
    where pr.etablissement_id = v_etablissement_id and pr.nom_complet = s.professeur_nom and pr.matiere = s.matiere
    limit 1
  ) p on true
  left join public.salles sa on sa.etablissement_id = v_etablissement_id and sa.nom = s.salle_nom;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Déplacements/échanges manuels appliqués en une seule transaction (la vérification des conflits est
-- différée à la fin, donc un échange de deux séances passe sans conflit transitoire).
create or replace function public.appliquer_deplacements(p_deplacements jsonb)
returns void
language plpgsql security invoker set search_path = ''
as $$
begin
  update public.emploi_du_temps e
  set jour = d.jour,
      creneau_id = d.creneau_id,
      salle_id = d.salle_id,
      verrouille = coalesce(d.verrouille, e.verrouille)
  from jsonb_to_recordset(p_deplacements) as d(id uuid, jour text, creneau_id uuid, salle_id uuid, verrouille boolean)
  where e.id = d.id and e.etablissement_id = public.mon_etablissement_id();
end;
$$;

revoke execute on function public.verifier_conflits_seance() from public, anon, authenticated;
revoke execute on function public.enregistrer_version(text) from public, anon;
revoke execute on function public.restaurer_version(uuid) from public, anon;
revoke execute on function public.appliquer_deplacements(jsonb) from public, anon;
grant execute on function public.enregistrer_version(text) to authenticated;
grant execute on function public.restaurer_version(uuid) to authenticated;
grant execute on function public.appliquer_deplacements(jsonb) to authenticated;

-- 7. Règles d'accès des nouvelles tables (même principe que les autres : son établissement uniquement)
alter table public.salles enable row level security;
alter table public.matieres_salles enable row level security;
alter table public.classes_details enable row level security;
alter table public.regroupements enable row level security;
alter table public.emploi_du_temps_versions enable row level security;
alter table public.generations enable row level security;

create policy "Salles de son établissement" on public.salles for all to authenticated
  using (etablissement_id = public.mon_etablissement_id()) with check (etablissement_id = public.mon_etablissement_id());
create policy "Matières/salles de son établissement" on public.matieres_salles for all to authenticated
  using (etablissement_id = public.mon_etablissement_id()) with check (etablissement_id = public.mon_etablissement_id());
create policy "Détail des classes de son établissement" on public.classes_details for all to authenticated
  using (etablissement_id = public.mon_etablissement_id()) with check (etablissement_id = public.mon_etablissement_id());
create policy "Regroupements de son établissement" on public.regroupements for all to authenticated
  using (etablissement_id = public.mon_etablissement_id()) with check (etablissement_id = public.mon_etablissement_id());
create policy "Versions de son établissement" on public.emploi_du_temps_versions for all to authenticated
  using (etablissement_id = public.mon_etablissement_id()) with check (etablissement_id = public.mon_etablissement_id());
create policy "Rapports de son établissement" on public.generations for all to authenticated
  using (etablissement_id = public.mon_etablissement_id()) with check (etablissement_id = public.mon_etablissement_id());
