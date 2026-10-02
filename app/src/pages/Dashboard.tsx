import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { History, RotateCcw, Save, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useEtablissement } from '@/hooks/useEtablissement'
import { useHorairesGrid } from '@/hooks/useHorairesGrid'
import { EMPLOI_DU_TEMPS_QUERY_KEY } from '@/hooks/useEmploiDuTempsData'
import { AppHeader } from '@/components/AppHeader'
import { Button } from '@/components/ui/button'
import { generateEmploiDuTemps, type ContrainteInput, type IndisponibiliteInput } from '@/lib/scheduling/generate'
import type { Entorse } from '@/lib/scheduling/entorses'
import { REGLES_DESCRIPTIONS, lireRegles } from '@/lib/regles'
import { anneeScolaire } from '@/lib/anneeScolaire'
import type { Cycle } from '@/lib/cycle'
import type { Json } from '@/lib/database.types'
import { cn } from '@/lib/utils'

interface Rapport {
  date: string
  totalCharges: number
  totalPlacees: number
  nbVerrouillees: number
  warnings: string[]
  entorses: Entorse[]
}

function RapportGeneration({ rapport }: { rapport: Rapport }) {
  const parRegle = new Map<string, Entorse[]>()
  for (const e of rapport.entorses) parRegle.set(e.regle, [...(parRegle.get(e.regle) ?? []), e])
  const complet = rapport.totalPlacees === rapport.totalCharges
  return (
    <div className="mt-5 text-left">
      <p className={cn('text-sm font-semibold', complet ? 'text-[#2F6F52]' : 'text-primary')}>
        {rapport.totalPlacees}/{rapport.totalCharges} séances placées
        {rapport.nbVerrouillees > 0 && ` (dont ${rapport.nbVerrouillees} verrouillées conservées)`} —{' '}
        <span className="font-normal text-muted-foreground">{new Date(rapport.date).toLocaleString('fr-FR')}</span>{' '}
        <Link to="/planning" className="font-semibold underline">
          Voir le planning
        </Link>
      </p>
      {rapport.warnings.length > 0 && (
        <div className="mt-3 rounded-lg border border-border bg-background p-3">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Avertissements ({rapport.warnings.length})</p>
          <ul className="max-h-48 space-y-1 overflow-y-auto text-xs text-muted-foreground">
            {rapport.warnings.map((w, i) => (
              <li key={i}>• {w}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-3 rounded-lg border border-border bg-background p-3">
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Règles pédagogiques ({rapport.entorses.length} entorse{rapport.entorses.length > 1 ? 's' : ''})
        </p>
        {rapport.entorses.length === 0 ? (
          <p className="text-xs text-[#2F6F52]">Toutes les règles actives sont respectées.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {REGLES_DESCRIPTIONS.filter((r) => parRegle.has(r.key)).map((r) => (
              <details key={r.key}>
                <summary className="cursor-pointer text-xs font-semibold text-foreground">
                  {r.titre} — {parRegle.get(r.key)!.length} cas
                </summary>
                <ul className="mt-1 max-h-40 list-disc overflow-y-auto pl-5 text-xs text-muted-foreground">
                  {parRegle.get(r.key)!.map((e, i) => (
                    <li key={i}>{e.detail}</li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export function Dashboard() {
  const { etablissementId, etablissement } = useEtablissement()
  const queryClient = useQueryClient()
  const [result, setResult] = useState<Rapport | null>(null)
  const { grid: horairesGrid } = useHorairesGrid(etablissementId)

  const { data: status } = useQuery({
    queryKey: ['dashboard_status', etablissementId],
    queryFn: async () => {
      const id = etablissementId!
      const [classes, professeurs, creneaux, horaires, salles, seances] = await Promise.all([
        supabase.from('classes_etablissement').select('nombre_classes').eq('etablissement_id', id),
        supabase.from('professeurs').select('nom_complet').eq('etablissement_id', id),
        supabase.from('creneaux_horaires').select('id', { count: 'exact', head: true }).eq('etablissement_id', id),
        supabase.from('horaires_reference').select('id', { count: 'exact', head: true }).eq('etablissement_id', id),
        supabase.from('salles').select('id', { count: 'exact', head: true }).eq('etablissement_id', id),
        supabase.from('emploi_du_temps').select('verrouille').eq('etablissement_id', id),
      ])
      return {
        classes: (classes.data ?? []).reduce((sum, row) => sum + row.nombre_classes, 0),
        // Un professeur qui enseigne plusieurs matières a plusieurs lignes — on compte les personnes.
        professeurs: new Set((professeurs.data ?? []).map((p) => p.nom_complet)).size,
        creneaux: creneaux.count ?? 0,
        horaires: horaires.count ?? 0,
        salles: salles.count ?? 0,
        seances: seances.data?.length ?? 0,
        verrouillees: (seances.data ?? []).filter((s) => s.verrouille).length,
      }
    },
    enabled: !!etablissementId,
  })

  const { data: dernierRapport } = useQuery({
    queryKey: ['dernier_rapport', etablissementId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('generations')
        .select('*')
        .eq('etablissement_id', etablissementId!)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data
    },
    enabled: !!etablissementId,
  })

  const { data: versions } = useQuery({
    queryKey: ['versions', etablissementId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('emploi_du_temps_versions')
        .select('id, label, nb_seances, created_at')
        .eq('etablissement_id', etablissementId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
    enabled: !!etablissementId,
  })

  function rafraichir() {
    queryClient.invalidateQueries({ queryKey: ['dashboard_status', etablissementId] })
    queryClient.invalidateQueries({ queryKey: ['dernier_rapport', etablissementId] })
    queryClient.invalidateQueries({ queryKey: ['versions', etablissementId] })
    queryClient.invalidateQueries({ queryKey: [EMPLOI_DU_TEMPS_QUERY_KEY, etablissementId] })
  }

  const generateMutation = useMutation({
    mutationFn: async (): Promise<Rapport> => {
      if (!etablissementId) throw new Error('Établissement introuvable pour ce compte.')
      const id = etablissementId

      // Laisse React peindre l'état "Génération en cours..." avant le calcul (synchrone, CPU-bound).
      await new Promise((resolve) => setTimeout(resolve, 50))

      const [professeursRes, classesRes, creneauxRes, contraintesRes, indisponibilitesRes, sallesRes, matieresSallesRes, detailsRes, regroupementsRes, verrouilleesRes] =
        await Promise.all([
          supabase.from('professeurs').select('id, nom_complet, matiere, niveaux').eq('etablissement_id', id),
          supabase.from('classes_etablissement').select('niveau, nombre_classes').eq('etablissement_id', id),
          supabase.from('creneaux_horaires').select('*').eq('etablissement_id', id),
          supabase.from('horaires_contraintes').select('cycle, jours_cours, mercredi_apres_midi_banalise, creneau_egale_heure, regles').eq('etablissement_id', id),
          supabase.from('professeur_indisponibilites').select('nom_complet, cycle, jour, creneau_id').eq('etablissement_id', id),
          supabase.from('salles').select('id, nom, type, capacite').eq('etablissement_id', id),
          supabase.from('matieres_salles').select('matiere, type_salle').eq('etablissement_id', id),
          supabase.from('classes_details').select('niveau, section, salle_id').eq('etablissement_id', id),
          supabase.from('regroupements').select('*').eq('etablissement_id', id),
          supabase.from('emploi_du_temps').select('*').eq('etablissement_id', id).eq('verrouille', true),
        ])
      for (const res of [professeursRes, classesRes, creneauxRes, contraintesRes, indisponibilitesRes, sallesRes, matieresSallesRes, detailsRes, regroupementsRes, verrouilleesRes]) {
        if (res.error) throw res.error
      }

      const generated = generateEmploiDuTemps({
        professeurs: professeursRes.data!.map((p) => ({ id: p.id, nomComplet: p.nom_complet, matiere: p.matiere, niveaux: p.niveaux })),
        classesEtablissement: classesRes.data!.map((c) => ({ niveau: c.niveau, nombreClasses: c.nombre_classes })),
        horairesGrid,
        creneaux: creneauxRes.data!,
        contraintes: contraintesRes.data!.map(
          (c): ContrainteInput => ({
            cycle: c.cycle as Cycle,
            joursCours: c.jours_cours,
            mercrediApresMidiBanalise: c.mercredi_apres_midi_banalise,
            creneauEgaleHeure: c.creneau_egale_heure,
            regles: lireRegles(c.regles),
          }),
        ),
        indisponibilites: indisponibilitesRes.data!.map(
          (i): IndisponibiliteInput => ({ nomComplet: i.nom_complet, cycle: i.cycle as Cycle, jour: i.jour, creneauId: i.creneau_id }),
        ),
        salles: sallesRes.data!,
        typeSalleParMatiere: Object.fromEntries(matieresSallesRes.data!.map((m) => [m.matiere, m.type_salle])),
        salleAttitreeParClasse: Object.fromEntries(
          detailsRes.data!.filter((d) => d.salle_id).map((d) => [`${d.niveau}-${d.section}`, d.salle_id!]),
        ),
        regroupements: regroupementsRes.data!.map((r) => ({
          id: r.id,
          type: r.type as 'tronc_commun' | 'tandem',
          libelle: r.libelle,
          matieres: r.matieres,
          classes: r.classes,
        })),
        seancesVerrouillees: verrouilleesRes.data!.map((s) => ({
          professeurId: s.professeur_id,
          niveau: s.niveau,
          section: s.section,
          matiere: s.matiere,
          cycle: s.cycle as Cycle,
          jour: s.jour,
          creneauId: s.creneau_id,
          salleId: s.salle_id,
          groupeSeance: s.groupe_seance,
        })),
        tentatives: 400,
        budgetMs: 5000,
      })

      // L'emploi du temps actuel est d'abord sauvegardé comme version (restaurable depuis ce tableau de bord).
      if ((status?.seances ?? 0) > 0) {
        const { error } = await supabase.rpc('enregistrer_version', {
          p_label: `Avant la génération du ${new Date().toLocaleString('fr-FR')}`,
        })
        if (error) throw error
      }

      // Les séances verrouillées restent en place ; toutes les autres sont remplacées.
      const { error: deleteError } = await supabase.from('emploi_du_temps').delete().eq('etablissement_id', id).eq('verrouille', false)
      if (deleteError) throw deleteError

      if (generated.seances.length > 0) {
        const { error: insertError } = await supabase.from('emploi_du_temps').insert(
          generated.seances.map((s) => ({
            etablissement_id: id,
            cycle: s.cycle,
            jour: s.jour,
            creneau_id: s.creneauId,
            niveau: s.niveau,
            section: s.section,
            matiere: s.matiere,
            professeur_id: s.professeurId,
            salle_id: s.salleId,
            groupe_seance: s.groupeSeance,
          })),
        )
        if (insertError) throw insertError
      }

      const rapport: Rapport = {
        date: new Date().toISOString(),
        totalCharges: generated.totalCharges,
        totalPlacees: generated.totalPlacees,
        nbVerrouillees: generated.nbVerrouillees,
        warnings: generated.warnings,
        entorses: generated.entorses,
      }
      const { error: rapportError } = await supabase.from('generations').insert({
        etablissement_id: id,
        total_charges: rapport.totalCharges,
        total_placees: rapport.totalPlacees,
        nb_verrouillees: rapport.nbVerrouillees,
        warnings: rapport.warnings as unknown as Json,
        entorses: rapport.entorses as unknown as Json,
      })
      if (rapportError) throw rapportError
      return rapport
    },
    onSuccess: (rapport) => {
      setResult(rapport)
      rafraichir()
    },
  })

  const versionMutation = useMutation({
    mutationFn: async (action: { type: 'enregistrer'; label: string } | { type: 'restaurer'; id: string } | { type: 'supprimer'; id: string }) => {
      if (action.type === 'enregistrer') {
        const { error } = await supabase.rpc('enregistrer_version', { p_label: action.label })
        if (error) throw error
      } else if (action.type === 'restaurer') {
        const { error: sauvegardeError } = await supabase.rpc('enregistrer_version', {
          p_label: `Avant la restauration du ${new Date().toLocaleString('fr-FR')}`,
        })
        if (sauvegardeError) throw sauvegardeError
        const { error } = await supabase.rpc('restaurer_version', { p_version_id: action.id })
        if (error) throw error
      } else {
        const { error } = await supabase.from('emploi_du_temps_versions').delete().eq('id', action.id)
        if (error) throw error
      }
    },
    onSuccess: rafraichir,
  })

  const rapportAffiche: Rapport | null =
    result ??
    (dernierRapport
      ? {
          date: dernierRapport.created_at,
          totalCharges: dernierRapport.total_charges,
          totalPlacees: dernierRapport.total_placees,
          nbVerrouillees: dernierRapport.nb_verrouillees,
          warnings: (dernierRapport.warnings as string[]) ?? [],
          entorses: (dernierRapport.entorses as unknown as Entorse[]) ?? [],
        }
      : null)

  const cards = [
    { label: 'Classes', value: status?.classes ?? 0, path: '/parametres-classes', requis: true },
    { label: 'Professeurs', value: status?.professeurs ?? 0, path: '/parametres-professeurs', requis: true },
    { label: 'Créneaux horaires', value: status?.creneaux ?? 0, path: '/parametres-contraintes', requis: true },
    { label: 'Horaires de référence', value: status?.horaires ?? 0, path: '/parametres', requis: true },
    { label: 'Salles (facultatif)', value: status?.salles ?? 0, path: '/parametres-salles', requis: false },
  ]
  const allReady = cards.filter((c) => c.requis).every((c) => c.value > 0)

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppHeader />

      <main className="mx-auto max-w-5xl p-8">
        <div className="mb-2 text-xs font-semibold uppercase tracking-[1.5px] text-primary">Dashboard</div>
        <h1 className="mb-1 font-serif text-3xl font-semibold text-foreground">Génération de l'emploi du temps</h1>
        <p className="mb-8 text-muted-foreground">
          Année scolaire {anneeScolaire(etablissement?.annee_scolaire)} · {etablissement?.name ?? 'ton établissement'}
        </p>

        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-5">
          {cards.map((card) => (
            <Link key={card.label} to={card.path} className="rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary">
              <div className="flex items-center justify-between">
                <div className="text-xs font-medium text-muted-foreground">{card.label}</div>
                <div
                  className={cn(
                    'flex h-4 w-4 items-center justify-center rounded-full text-[10px] text-white',
                    card.value > 0 ? 'bg-[#2F6F52]' : card.requis ? 'bg-muted-foreground/40' : 'bg-muted',
                  )}
                >
                  {card.value > 0 ? '✓' : card.requis ? '!' : '–'}
                </div>
              </div>
              <div className="mt-1.5 font-serif text-2xl font-semibold text-foreground">{card.value}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {card.value > 0 ? 'Données chargées' : card.requis ? 'À compléter' : 'Sans salles'}
              </div>
            </Link>
          ))}
        </div>

        <div className="mb-8 rounded-xl border border-border bg-card p-8 text-center">
          {allReady ? (
            <>
              <p className="mb-2 text-sm text-muted-foreground">
                Toutes les données sources sont chargées. Prêt à générer l'emploi du temps sous contraintes.
              </p>
              {(status?.verrouillees ?? 0) > 0 && (
                <p className="mb-4 text-xs text-muted-foreground">
                  🔒 {status!.verrouillees} séance(s) verrouillée(s) seront conservées telles quelles ; l'emploi du temps actuel
                  sera sauvegardé comme version avant d'être remplacé.
                </p>
              )}
              <Button size="lg" onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending}>
                {generateMutation.isPending ? 'Génération en cours (quelques secondes)...' : 'Générer l’emploi du temps'}
              </Button>

              {generateMutation.isError && (
                <p className="mt-4 text-sm text-destructive">
                  {generateMutation.error instanceof Error ? generateMutation.error.message : 'Échec de la génération.'}
                </p>
              )}

              {rapportAffiche && <RapportGeneration rapport={rapportAffiche} />}
            </>
          ) : (
            <>
              <p className="mb-4 text-sm text-muted-foreground">Certaines données sont encore manquantes avant de pouvoir générer l'emploi du temps.</p>
              <div className="flex flex-wrap justify-center gap-2">
                {cards
                  .filter((c) => c.requis && c.value === 0)
                  .map((c) => (
                    <Link
                      key={c.path}
                      to={c.path}
                      className="rounded-full border border-primary px-4 py-1.5 text-xs font-semibold text-primary hover:bg-primary hover:text-primary-foreground"
                    >
                      Compléter {c.label.toLowerCase()}
                    </Link>
                  ))}
              </div>
            </>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 font-serif text-lg font-semibold">
                <History className="h-4 w-4" /> Versions enregistrées
              </h2>
              <p className="text-xs text-muted-foreground">
                Chaque génération et chaque restauration sauvegardent d'abord l'emploi du temps en cours. Tu peux aussi
                enregistrer une version manuellement (ex. « Version validée par le proviseur »).
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={(status?.seances ?? 0) === 0 || versionMutation.isPending}
              onClick={() => {
                const label = window.prompt('Nom de la version', `Version du ${new Date().toLocaleDateString('fr-FR')}`)
                if (label?.trim()) versionMutation.mutate({ type: 'enregistrer', label: label.trim() })
              }}
            >
              <Save className="mr-1 h-3.5 w-3.5" /> Enregistrer la version actuelle
            </Button>
          </div>
          {versionMutation.isError && (
            <p className="mb-3 text-sm text-destructive">
              {versionMutation.error instanceof Error ? versionMutation.error.message : 'Action impossible.'}
            </p>
          )}
          {(versions ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune version enregistrée.</p>
          ) : (
            <ul className="divide-y divide-border">
              {versions!.map((v) => (
                <li key={v.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div>
                    <div className="text-sm font-medium">{v.label}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(v.created_at).toLocaleString('fr-FR')} · {v.nb_seances} séances
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={versionMutation.isPending}
                      onClick={() => {
                        if (window.confirm(`Restaurer « ${v.label} » ? L'emploi du temps actuel sera d'abord sauvegardé.`)) {
                          versionMutation.mutate({ type: 'restaurer', id: v.id })
                        }
                      }}
                    >
                      <RotateCcw className="mr-1 h-3.5 w-3.5" /> Restaurer
                    </Button>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-destructive"
                      aria-label="Supprimer cette version"
                      onClick={() => {
                        if (window.confirm(`Supprimer définitivement la version « ${v.label} » ?`)) versionMutation.mutate({ type: 'supprimer', id: v.id })
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  )
}
