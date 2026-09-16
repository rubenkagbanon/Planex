import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useProfile } from '@/hooks/useProfile'
import { useHorairesGrid, buildDefaultGrid, type HorairesGrid } from '@/hooks/useHorairesGrid'
import { Button } from '@/components/ui/button'
import { computeColumnTotal, DISCIPLINES, NIVEAUX } from '@/lib/horairesReference'

type Grid = HorairesGrid

export function HorairesTable() {
  const { data: profile } = useProfile()
  const etablissementId = profile?.etablissement_id ?? null
  const queryClient = useQueryClient()

  const { grid: loadedGrid, isLoading } = useHorairesGrid(etablissementId)
  const [grid, setGrid] = useState<Grid>(loadedGrid)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    if (hydrated || isLoading) return
    setGrid(loadedGrid)
    setHydrated(true)
  }, [loadedGrid, isLoading, hydrated])

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!etablissementId) throw new Error('Établissement introuvable pour ce compte.')
      const rows = DISCIPLINES.flatMap((discipline) =>
        NIVEAUX.map((niveau) => ({
          etablissement_id: etablissementId,
          discipline,
          niveau: niveau.key,
          valeur: grid[discipline]?.[niveau.key] ?? '',
        })),
      )
      const { error } = await supabase
        .from('horaires_reference')
        .upsert(rows, { onConflict: 'etablissement_id,discipline,niveau' })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['horaires_reference', etablissementId] })
    },
  })

  function resetDefault() {
    const confirmed = window.confirm(
      'Réinitialiser aux valeurs par défaut ? Toutes les cellules modifiées seront remplacées (à confirmer ensuite avec "Enregistrer" pour que ce soit définitif).',
    )
    if (!confirmed) return
    setGrid(buildDefaultGrid())
  }

  function updateCell(discipline: string, niveauKey: string, value: string) {
    setGrid((current) => ({
      ...current,
      [discipline]: { ...current[discipline], [niveauKey]: value },
    }))
  }

  const totals = useMemo(
    () => Object.fromEntries(NIVEAUX.map((niveau) => [niveau.key, computeColumnTotal(grid, niveau.key)])),
    [grid],
  )

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          Grille horaire par semaines de référence (Circulaire N°0311/MENA/CAB/DPFC, année 2025-2026). Valeurs
          pré-remplies, modifiables — corrige-les si besoin, puis enregistre.
        </p>
        <div className="flex flex-col items-end gap-2">
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !etablissementId}>
            {saveMutation.isPending ? 'Enregistrement...' : 'Enregistrer'}
          </Button>
          <button
            type="button"
            onClick={resetDefault}
            className="whitespace-nowrap text-xs font-semibold text-primary hover:underline"
          >
            Réinitialiser aux valeurs par défaut
          </button>
        </div>
      </div>

      {saveMutation.isSuccess && <p className="mb-3 text-sm text-primary">Enregistré.</p>}
      {saveMutation.isError && (
        <p className="mb-3 text-sm text-destructive">
          {saveMutation.error instanceof Error ? saveMutation.error.message : 'Échec de l’enregistrement.'}
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-secondary text-secondary-foreground">
              <th className="sticky left-0 z-10 bg-secondary px-3 py-2 text-left font-semibold">Discipline</th>
              {NIVEAUX.map((niveau) => (
                <th key={niveau.key} className="whitespace-nowrap px-2 py-2 text-center font-semibold">
                  {niveau.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DISCIPLINES.map((discipline, i) => (
              <tr key={discipline} className={i % 2 === 0 ? 'bg-card' : 'bg-background'}>
                <td
                  className={`sticky left-0 z-10 whitespace-nowrap px-3 py-1.5 font-medium ${i % 2 === 0 ? 'bg-card' : 'bg-background'}`}
                >
                  {discipline}
                </td>
                {NIVEAUX.map((niveau) => (
                  <td key={niveau.key} className="p-1">
                    <input
                      value={grid[discipline]?.[niveau.key] ?? ''}
                      onChange={(e) => updateCell(discipline, niveau.key, e.target.value)}
                      className="w-24 rounded-md border border-border bg-transparent px-2 py-1 text-center text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </td>
                ))}
              </tr>
            ))}
            <tr className="border-t-2 border-primary bg-muted/40">
              <td className="sticky left-0 z-10 whitespace-nowrap bg-muted/40 px-3 py-1.5 font-semibold">TOTAL</td>
              {NIVEAUX.map((niveau) => (
                <td key={niveau.key} className="px-2 py-1.5 text-center text-xs font-semibold">
                  {totals[niveau.key]}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        La ligne TOTAL se recalcule automatiquement à partir des cellules ci-dessus. Fac = facultative · h = heures
        · A1/A2 = options de spécialité en Mathématiques.
      </p>
    </div>
  )
}
