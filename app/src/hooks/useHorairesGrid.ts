import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { DEFAULT_HORAIRES, DISCIPLINES } from '@/lib/horairesReference'

export type HorairesGrid = Record<string, Record<string, string>>

export function buildDefaultGrid(): HorairesGrid {
  const grid: HorairesGrid = {}
  for (const discipline of DISCIPLINES) {
    grid[discipline] = { ...DEFAULT_HORAIRES[discipline] }
  }
  return grid
}

// Grille horaires de référence (discipline × niveau) pour un établissement : valeurs par défaut de la
// circulaire, surchargées par ce que l'établissement a enregistré dans `horaires_reference`.
export function useHorairesGrid(etablissementId: string | null) {
  const [grid, setGrid] = useState<HorairesGrid>(buildDefaultGrid)
  const [hydrated, setHydrated] = useState(false)

  const { data: overrides, isLoading } = useQuery({
    queryKey: ['horaires_reference', etablissementId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('horaires_reference')
        .select('discipline, niveau, valeur')
        .eq('etablissement_id', etablissementId!)
      if (error) throw error
      return data
    },
    enabled: !!etablissementId,
  })

  useEffect(() => {
    if (hydrated || !overrides) return
    setGrid((current) => {
      const next: HorairesGrid = { ...current }
      for (const row of overrides) {
        next[row.discipline] = { ...next[row.discipline], [row.niveau]: row.valeur }
      }
      return next
    })
    setHydrated(true)
  }, [overrides, hydrated])

  return { grid, isLoading: isLoading || !hydrated }
}
