-- Bibliothèque des années scolaires : l'application travaille sur une seule année (l'année active,
-- etablissements.annee_scolaire). À la fin de l'année, l'administrateur la « clôture » : une photo complète
-- (paramétrage, emploi du temps final, versions de l'année) est rangée dans annees_archivees, puis
-- l'établissement passe à l'année suivante en gardant son paramétrage comme point de départ.
-- Une année passée peut aussi y être ajoutée à partir d'un emploi du temps importé (PDF).

create table if not exists public.annees_archivees (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements (id) on delete cascade,
  annee_scolaire text not null,
  -- 'cloture' : année clôturée dans Planex ; 'import' : emploi du temps importé (PDF)
  origine text not null default 'cloture' check (origine in ('cloture', 'import')),
  nb_seances integer not null default 0,
  nb_classes integer not null default 0,
  nb_professeurs integer not null default 0,
  -- Paramétrage de l'année (établissement, classes, professeurs, salles, horaires, règles…) — vide pour un import
  donnees jsonb not null default '{}'::jsonb,
  -- Emploi du temps final, au format des versions (+ heure_fin)
  seances jsonb not null default '[]'::jsonb,
  -- Versions enregistrées pendant l'année (label, date, séances)
  versions jsonb not null default '[]'::jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (etablissement_id, annee_scolaire)
);

create index if not exists annees_archivees_etablissement_idx on public.annees_archivees (etablissement_id);

alter table public.annees_archivees enable row level security;

-- Tous les membres consultent ; seul l'administrateur ajoute (import d'une année passée) ou supprime. La
-- clôture passe par la fonction cloturer_annee.
drop policy if exists "Archives : lecture" on public.annees_archivees;
create policy "Archives : lecture" on public.annees_archivees for select to authenticated
  using (etablissement_id = public.mon_etablissement_id());

drop policy if exists "Archives : ajout par l'administrateur" on public.annees_archivees;
create policy "Archives : ajout par l'administrateur" on public.annees_archivees for insert to authenticated
  with check (etablissement_id = public.mon_etablissement_id() and public.est_admin() and origine = 'import');

drop policy if exists "Archives : suppression par l'administrateur" on public.annees_archivees;
create policy "Archives : suppression par l'administrateur" on public.annees_archivees for delete to authenticated
  using (etablissement_id = public.mon_etablissement_id() and public.est_admin());

revoke all on public.annees_archivees from anon;
grant select, insert, delete on public.annees_archivees to authenticated;

-- Clôture de l'année active : archive tout, range les versions de l'année avec elle, puis passe à la
-- nouvelle année. Options : vider l'emploi du temps (et ses rapports de génération), effacer les
-- professeurs principaux. Le reste du paramétrage est conservé comme point de départ.
create or replace function public.cloturer_annee(
  p_nouvelle_annee text,
  p_vider_emploi_du_temps boolean default true,
  p_vider_professeurs_principaux boolean default true
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_etab uuid := public.mon_etablissement_id();
  v_annee text;
  v_id uuid;
begin
  if v_etab is null then
    raise exception 'Établissement introuvable pour ce compte.';
  end if;
  if not public.est_admin() then
    raise exception 'Seul l''administrateur de l''établissement peut clôturer une année.';
  end if;
  select nullif(trim(annee_scolaire), '') into v_annee from public.etablissements where id = v_etab;
  if v_annee is null then
    raise exception 'Renseigne d''abord l''année scolaire en cours (Paramètres › Établissement).';
  end if;
  if nullif(trim(p_nouvelle_annee), '') is null or trim(p_nouvelle_annee) = v_annee then
    raise exception 'La nouvelle année doit être différente de l''année en cours (%).', v_annee;
  end if;
  if exists (select 1 from public.annees_archivees where etablissement_id = v_etab and annee_scolaire = v_annee) then
    raise exception 'L''année % est déjà dans la bibliothèque.', v_annee;
  end if;

  insert into public.annees_archivees (etablissement_id, annee_scolaire, origine, nb_seances, nb_classes, nb_professeurs, donnees, seances, versions)
  select
    v_etab,
    v_annee,
    'cloture',
    (select count(*) from public.emploi_du_temps where etablissement_id = v_etab),
    (select coalesce(sum(nombre_classes), 0) from public.classes_etablissement where etablissement_id = v_etab),
    (select count(distinct lower(trim(nom_complet))) from public.professeurs where etablissement_id = v_etab),
    jsonb_build_object(
      'etablissement', (select to_jsonb(e) - 'code_invitation' from public.etablissements e where e.id = v_etab),
      'classes', (select coalesce(jsonb_agg(jsonb_build_object('niveau', niveau, 'nombre_classes', nombre_classes)), '[]') from public.classes_etablissement where etablissement_id = v_etab),
      'classes_details', (
        select coalesce(jsonb_agg(jsonb_build_object('niveau', d.niveau, 'section', d.section, 'professeur_principal', d.professeur_principal, 'salle_nom', s.nom)), '[]')
        from public.classes_details d left join public.salles s on s.id = d.salle_id where d.etablissement_id = v_etab
      ),
      'professeurs', (
        select coalesce(jsonb_agg(jsonb_build_object('nom_complet', nom_complet, 'matiere', matiere, 'niveaux', niveaux, 'volume_horaire', volume_horaire, 'remarque', remarque) order by nom_complet), '[]')
        from public.professeurs where etablissement_id = v_etab
      ),
      'salles', (select coalesce(jsonb_agg(jsonb_build_object('nom', nom, 'type', type, 'capacite', capacite) order by nom), '[]') from public.salles where etablissement_id = v_etab),
      'matieres_salles', (select coalesce(jsonb_agg(jsonb_build_object('matiere', matiere, 'type_salle', type_salle)), '[]') from public.matieres_salles where etablissement_id = v_etab),
      'regroupements', (select coalesce(jsonb_agg(jsonb_build_object('type', type, 'libelle', libelle, 'matieres', matieres, 'classes', classes)), '[]') from public.regroupements where etablissement_id = v_etab),
      'horaires_contraintes', (
        select coalesce(jsonb_agg(jsonb_build_object('cycle', cycle, 'jours_cours', jours_cours, 'mercredi_apres_midi_banalise', mercredi_apres_midi_banalise,
          'creneau_egale_heure', creneau_egale_heure, 'couleur_matieres', couleur_matieres, 'regles', regles)), '[]')
        from public.horaires_contraintes where etablissement_id = v_etab
      ),
      'creneaux', (
        select coalesce(jsonb_agg(jsonb_build_object('cycle', cycle, 'heure_debut', heure_debut::text, 'heure_fin', heure_fin::text, 'type', type) order by cycle, heure_debut), '[]')
        from public.creneaux_horaires where etablissement_id = v_etab
      ),
      'horaires_reference', (select coalesce(jsonb_agg(jsonb_build_object('discipline', discipline, 'niveau', niveau, 'valeur', valeur)), '[]') from public.horaires_reference where etablissement_id = v_etab),
      'indisponibilites', (
        select coalesce(jsonb_agg(jsonb_build_object('nom_complet', i.nom_complet, 'cycle', i.cycle, 'jour', i.jour, 'heure_debut', c.heure_debut::text)), '[]')
        from public.professeur_indisponibilites i left join public.creneaux_horaires c on c.id = i.creneau_id where i.etablissement_id = v_etab
      ),
      'dernier_rapport', (
        select to_jsonb(g) - 'id' - 'etablissement_id' from public.generations g where g.etablissement_id = v_etab order by g.created_at desc limit 1
      )
    ),
    (
      select coalesce(jsonb_agg(jsonb_build_object(
        'cycle', e.cycle, 'jour', e.jour, 'heure_debut', c.heure_debut::text, 'heure_fin', c.heure_fin::text,
        'niveau', e.niveau, 'section', e.section, 'matiere', e.matiere, 'professeur_nom', p.nom_complet,
        'salle_nom', s.nom, 'verrouille', e.verrouille, 'groupe_seance', e.groupe_seance
      )), '[]')
      from public.emploi_du_temps e
      join public.creneaux_horaires c on c.id = e.creneau_id
      join public.professeurs p on p.id = e.professeur_id
      left join public.salles s on s.id = e.salle_id
      where e.etablissement_id = v_etab
    ),
    (
      select coalesce(jsonb_agg(jsonb_build_object('label', label, 'created_at', created_at, 'nb_seances', nb_seances, 'seances', seances) order by created_at), '[]')
      from public.emploi_du_temps_versions where etablissement_id = v_etab
    )
  returning id into v_id;

  -- Les versions de l'année sont désormais rangées avec elle
  delete from public.emploi_du_temps_versions where etablissement_id = v_etab;

  if p_vider_emploi_du_temps then
    delete from public.emploi_du_temps where etablissement_id = v_etab;
    delete from public.generations where etablissement_id = v_etab;
  end if;
  if p_vider_professeurs_principaux then
    update public.classes_details set professeur_principal = null where etablissement_id = v_etab;
  end if;
  update public.etablissements set annee_scolaire = trim(p_nouvelle_annee) where id = v_etab;
  return v_id;
end;
$$;

revoke all on function public.cloturer_annee(text, boolean, boolean) from public, anon;
grant execute on function public.cloturer_annee(text, boolean, boolean) to authenticated;
