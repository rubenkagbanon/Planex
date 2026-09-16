import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { JOURS_SEMAINE } from '@/lib/joursSemaine'
import type { Cycle } from '@/lib/cycle'
import { cn } from '@/lib/utils'

function formatHeure(hhmmss: string): string {
  return hhmmss.slice(0, 5)
}

interface Row {
  heureDebut: string
  heureFin: string
  type: string
  idsByCycle: Partial<Record<Cycle, string>>
}

const CRENEAU_TYPE_LABEL: Record<string, string> = { recreation: 'RÉCRÉATION', dejeuner: 'DÉJEUNER' }

// Grille jours × créneaux permettant de déclarer, pour un professeur (identifié par son nom — une même
// personne peut avoir plusieurs fiches, une par matière), les moments où il/elle n'est jamais disponible
// pour être placé(e) en cours. Fusionne les cycles actifs de la personne comme le planning (ProfesseurGrid
// dans Planning.tsx) : un même horaire réel présent dans plusieurs cycles ne compte que pour une case.
export function IndisponibilitesModal({
  etablissementId,
  nomComplet,
  cycles,
  onClose,
}: {
  etablissementId: string
  nomComplet: string
  cycles: Cycle[]
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const cyclesKey = [...cycles].sort().join(',')

  const { data: creneaux } = useQuery({
    queryKey: ['indispo_creneaux', etablissementId, cyclesKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('creneaux_horaires')
        .select('*')
        .eq('etablissement_id', etablissementId)
        .in('cycle', cycles)
        .order('heure_debut', { ascending: true })
      if (error) throw error
      return data
    },
  })

  const { data: contraintesRows } = useQuery({
    queryKey: ['indispo_contraintes', etablissementId, cyclesKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('horaires_contraintes')
        .select('jours_cours')
        .eq('etablissement_id', etablissementId)
        .in('cycle', cycles)
      if (error) throw error
      return data
    },
  })

  const jours = JOURS_SEMAINE.filter((j) => (contraintesRows ?? []).some((c) => c.jours_cours.includes(j.key)))

  const rowsMap = new Map<string, Row>()
  for (const c of creneaux ?? []) {
    const key = `${c.heure_debut}|${c.heure_fin}|${c.type}`
    const row = rowsMap.get(key) ?? { heureDebut: c.heure_debut, heureFin: c.heure_fin, type: c.type, idsByCycle: {} }
    row.idsByCycle[c.cycle as Cycle] = c.id
    rowsMap.set(key, row)
  }
  const rows = [...rowsMap.values()].sort((a, b) => a.heureDebut.localeCompare(b.heureDebut))

  const { data: existing } = useQuery({
    queryKey: ['indispo_existing', etablissementId, nomComplet],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('professeur_indisponibilites')
        .select('cycle, jour, creneau_id')
        .eq('etablissement_id', etablissementId)
        .eq('nom_complet', nomComplet)
      if (error) throw error
      return data
    },
  })

  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    if (hydrated || !existing || !creneaux) return
    const creneauById = new Map(creneaux.map((c) => [c.id, c]))
    const next = new Set<string>()
    for (const e of existing) {
      const c = creneauById.get(e.creneau_id)
      if (c) next.add(`${e.jour}|${c.heure_debut}|${c.heure_fin}`)
    }
    setChecked(next)
    setHydrated(true)
  }, [existing, creneaux, hydrated])

  function toggle(jourKey: string, row: Row) {
    const key = `${jourKey}|${row.heureDebut}|${row.heureFin}`
    setChecked((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error: deleteError } = await supabase
        .from('professeur_indisponibilites')
        .delete()
        .eq('etablissement_id', etablissementId)
        .eq('nom_complet', nomComplet)
      if (deleteError) throw deleteError

      const insertRows: { etablissement_id: string; nom_complet: string; cycle: Cycle; jour: string; creneau_id: string }[] = []
      for (const key of checked) {
        const [jourKey, heureDebut, heureFin] = key.split('|')
        const row = rows.find((r) => r.heureDebut === heureDebut && r.heureFin === heureFin)
        if (!row) continue
        for (const cycle of cycles) {
          const creneauId = row.idsByCycle[cycle]
          if (creneauId) {
            insertRows.push({ etablissement_id: etablissementId, nom_complet: nomComplet, cycle, jour: jourKey, creneau_id: creneauId })
          }
        }
      }
      if (insertRows.length > 0) {
        const { error: insertError } = await supabase.from('professeur_indisponibilites').insert(insertRows)
        if (insertError) throw insertError
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['indispo_existing', etablissementId, nomComplet] })
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-border bg-card p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-start justify-between gap-4">
          <h3 className="font-serif text-lg font-semibold text-foreground">Indisponibilités — {nomComplet}</h3>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Fermer">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          Coche les créneaux où {nomComplet} n'est jamais disponible pour être placé(e) en cours. Enregistrer
          remplace entièrement ce qui était coché avant.
        </p>

        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full table-fixed border-collapse text-sm">
            <thead>
              <tr className="bg-secondary text-secondary-foreground">
                <th className="w-24 whitespace-nowrap px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide">
                  Horaires
                </th>
                {jours.map((j) => (
                  <th key={j.key} className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide">
                    {j.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isBreak = row.type !== 'cours'
                return (
                <tr key={`${row.heureDebut}-${row.heureFin}-${row.type}`} className="border-t border-border">
                  <td className="whitespace-nowrap px-2 py-1.5 text-xs font-medium text-muted-foreground">
                    {formatHeure(row.heureDebut)} - {formatHeure(row.heureFin)}
                  </td>
                  {isBreak ? (
                    <td
                      colSpan={jours.length}
                      className="bg-muted/50 px-2 py-1.5 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                    >
                      {CRENEAU_TYPE_LABEL[row.type] ?? row.type}
                    </td>
                  ) : (
                    jours.map((j) => {
                      const key = `${j.key}|${row.heureDebut}|${row.heureFin}`
                      const isChecked = checked.has(key)
                      return (
                        <td key={j.key} className="border-l border-border p-1 text-center">
                          <button
                            type="button"
                            onClick={() => toggle(j.key, row)}
                            aria-pressed={isChecked}
                            aria-label={`${nomComplet} indisponible ${j.label} ${formatHeure(row.heureDebut)}`}
                            className={cn(
                              'h-6 w-full rounded-md border text-xs font-semibold transition-colors',
                              isChecked
                                ? 'border-destructive bg-destructive text-destructive-foreground'
                                : 'border-border bg-background text-muted-foreground hover:text-foreground',
                            )}
                          >
                            {isChecked ? '✕' : ''}
                          </button>
                        </td>
                      )
                    })
                  )}
                </tr>
                )
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={jours.length + 1} className="px-3 py-6 text-center text-sm text-muted-foreground">
                    Aucun créneau de cours configuré — configure-les dans Paramètres {'>'} Horaires & contraintes.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center justify-end gap-3">
          {saveMutation.isSuccess && <p className="text-sm text-primary">Enregistré.</p>}
          {saveMutation.isError && (
            <p className="text-sm text-destructive">
              {saveMutation.error instanceof Error ? saveMutation.error.message : 'Échec de l’enregistrement.'}
            </p>
          )}
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? 'Enregistrement...' : 'Enregistrer'}
          </Button>
        </div>
      </div>
    </div>
  )
}
