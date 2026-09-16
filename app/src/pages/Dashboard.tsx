import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { useProfile } from '@/hooks/useProfile'
import { useHorairesGrid } from '@/hooks/useHorairesGrid'
import { AppHeader } from '@/components/AppHeader'
import { Button } from '@/components/ui/button'
import { generateEmploiDuTemps, type ContrainteInput, type IndisponibiliteInput } from '@/lib/scheduling/generate'
import type { Cycle } from '@/lib/cycle'
import { cn } from '@/lib/utils'

export function Dashboard() {
  const { user } = useAuth()
  const { data: profile } = useProfile()
  const etablissementId = profile?.etablissement_id ?? null
  const etablissement = (user?.user_metadata?.etablissement_name as string | undefined) ?? 'ton établissement'
  const queryClient = useQueryClient()
  const [result, setResult] = useState<{ warnings: string[]; totalCharges: number; totalPlacees: number } | null>(
    null,
  )
  const { grid: horairesGrid } = useHorairesGrid(etablissementId)

  const { data: status } = useQuery({
    queryKey: ['dashboard_status', etablissementId],
    queryFn: async () => {
      const [classes, professeurs, creneaux, horaires] = await Promise.all([
        supabase
          .from('classes_etablissement')
          .select('nombre_classes')
          .eq('etablissement_id', etablissementId!),
        supabase.from('professeurs').select('nom_complet').eq('etablissement_id', etablissementId!),
        supabase.from('creneaux_horaires').select('id', { count: 'exact', head: true }).eq('etablissement_id', etablissementId!),
        supabase.from('horaires_reference').select('id', { count: 'exact', head: true }).eq('etablissement_id', etablissementId!),
      ])
      const nombreClasses = (classes.data ?? []).reduce((sum, row) => sum + row.nombre_classes, 0)
      // Un professeur qui enseigne plusieurs matières a plusieurs lignes — on compte les personnes, pas les lignes.
      const nombreProfesseurs = new Set((professeurs.data ?? []).map((p) => p.nom_complet)).size
      return {
        classes: nombreClasses,
        professeurs: nombreProfesseurs,
        creneaux: creneaux.count ?? 0,
        horaires: horaires.count ?? 0,
      }
    },
    enabled: !!etablissementId,
  })

  const generateMutation = useMutation({
    mutationFn: async () => {
      if (!etablissementId) throw new Error('Établissement introuvable pour ce compte.')

      // Laisse React peindre l'état "Génération en cours..." avant le calcul (synchrone, CPU-bound).
      await new Promise((resolve) => setTimeout(resolve, 0))

      const [professeursRes, classesRes, creneauxRes, contraintesRes, indisponibilitesRes] = await Promise.all([
        supabase.from('professeurs').select('id, nom_complet, matiere, niveaux').eq('etablissement_id', etablissementId),
        supabase.from('classes_etablissement').select('niveau, nombre_classes').eq('etablissement_id', etablissementId),
        supabase.from('creneaux_horaires').select('*').eq('etablissement_id', etablissementId),
        supabase
          .from('horaires_contraintes')
          .select('cycle, jours_cours, mercredi_apres_midi_banalise, creneau_egale_heure')
          .eq('etablissement_id', etablissementId),
        supabase.from('professeur_indisponibilites').select('nom_complet, cycle, jour, creneau_id').eq('etablissement_id', etablissementId),
      ])
      if (professeursRes.error) throw professeursRes.error
      if (classesRes.error) throw classesRes.error
      if (creneauxRes.error) throw creneauxRes.error
      if (contraintesRes.error) throw contraintesRes.error
      if (indisponibilitesRes.error) throw indisponibilitesRes.error

      const generated = generateEmploiDuTemps({
        professeurs: professeursRes.data.map((p) => ({
          id: p.id,
          nomComplet: p.nom_complet,
          matiere: p.matiere,
          niveaux: p.niveaux,
        })),
        classesEtablissement: classesRes.data.map((c) => ({ niveau: c.niveau, nombreClasses: c.nombre_classes })),
        horairesGrid,
        creneaux: creneauxRes.data,
        contraintes: contraintesRes.data.map(
          (c): ContrainteInput => ({
            cycle: c.cycle as Cycle,
            joursCours: c.jours_cours,
            mercrediApresMidiBanalise: c.mercredi_apres_midi_banalise,
            creneauEgaleHeure: c.creneau_egale_heure,
          }),
        ),
        indisponibilites: indisponibilitesRes.data.map(
          (i): IndisponibiliteInput => ({
            nomComplet: i.nom_complet,
            cycle: i.cycle as Cycle,
            jour: i.jour,
            creneauId: i.creneau_id,
          }),
        ),
      })

      const { error: deleteError } = await supabase.from('emploi_du_temps').delete().eq('etablissement_id', etablissementId)
      if (deleteError) throw deleteError

      if (generated.seances.length > 0) {
        const rows = generated.seances.map((s) => ({
          etablissement_id: etablissementId,
          cycle: s.cycle,
          jour: s.jour,
          creneau_id: s.creneauId,
          niveau: s.niveau,
          section: s.section,
          matiere: s.matiere,
          professeur_id: s.professeurId,
        }))
        const { error: insertError } = await supabase.from('emploi_du_temps').insert(rows)
        if (insertError) throw insertError
      }

      return { warnings: generated.warnings, totalCharges: generated.totalCharges, totalPlacees: generated.totalPlacees }
    },
    onSuccess: (data) => {
      setResult(data)
      queryClient.invalidateQueries({ queryKey: ['planning_emploi_du_temps'] })
    },
  })

  const cards = [
    { label: 'Classes', value: status?.classes ?? 0, path: '/parametres-classes' },
    { label: 'Professeurs', value: status?.professeurs ?? 0, path: '/parametres-professeurs' },
    { label: 'Créneaux horaires', value: status?.creneaux ?? 0, path: '/parametres-contraintes' },
    { label: 'Horaires de référence', value: status?.horaires ?? 0, path: '/parametres' },
  ]

  const allReady = cards.every((c) => c.value > 0)

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppHeader />

      <main className="mx-auto max-w-4xl p-8">
        <div className="mb-2 text-xs font-semibold uppercase tracking-[1.5px] text-primary">Dashboard</div>
        <h1 className="mb-1 font-serif text-3xl font-semibold text-foreground">Génération de l'emploi du temps</h1>
        <p className="mb-8 text-muted-foreground">Année scolaire 2025–2026 · {etablissement}</p>

        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {cards.map((card) => (
            <Link
              key={card.label}
              to={card.path}
              className="rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary"
            >
              <div className="flex items-center justify-between">
                <div className="text-xs font-medium text-muted-foreground">{card.label}</div>
                <div
                  className={cn(
                    'flex h-4 w-4 items-center justify-center rounded-full text-[10px] text-white',
                    card.value > 0 ? 'bg-[#2F6F52]' : 'bg-muted-foreground/40',
                  )}
                >
                  {card.value > 0 ? '✓' : '!'}
                </div>
              </div>
              <div className="mt-1.5 font-serif text-2xl font-semibold text-foreground">{card.value}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {card.value > 0 ? 'Données chargées' : 'À compléter'}
              </div>
            </Link>
          ))}
        </div>

        <div className="mb-8 rounded-xl border border-border bg-card p-8 text-center">
          {allReady ? (
            <>
              <p className="mb-5 text-sm text-muted-foreground">
                Toutes les données sources sont chargées. Prêt à générer l'emploi du temps sous contraintes.
              </p>
              <Button size="lg" onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending}>
                {generateMutation.isPending ? 'Génération en cours...' : 'Générer l’emploi du temps'}
              </Button>

              {generateMutation.isError && (
                <p className="mt-4 text-sm text-destructive">
                  {generateMutation.error instanceof Error ? generateMutation.error.message : 'Échec de la génération.'}
                </p>
              )}

              {result && (
                <div className="mt-5 text-left">
                  <p className="text-sm text-primary">
                    {result.totalPlacees}/{result.totalCharges} séances placées.{' '}
                    <Link to="/planning" className="font-semibold underline">
                      Voir le planning
                    </Link>
                  </p>
                  {result.warnings.length > 0 && (
                    <div className="mt-3 rounded-lg border border-border bg-background p-3">
                      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Avertissements ({result.warnings.length})
                      </p>
                      <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-muted-foreground">
                        {result.warnings.map((w, i) => (
                          <li key={i}>• {w}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              <p className="mb-4 text-sm text-muted-foreground">
                Certaines données sont encore manquantes avant de pouvoir générer l'emploi du temps.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {cards
                  .filter((c) => c.value === 0)
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
      </main>
    </div>
  )
}
