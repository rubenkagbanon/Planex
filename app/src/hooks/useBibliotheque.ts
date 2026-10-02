import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { tableAbsente } from '@/hooks/useEmploiDuTempsData'
import { archiveCommeSource, type AnneeArchivee, type SourceEmploiDuTemps } from '@/lib/bibliotheque'

export const BIBLIOTHEQUE_QUERY_KEY = 'bibliotheque'

// Années de la bibliothèque de l'établissement. `disponible` est faux tant que la migration qui crée la
// table n'est pas appliquée (l'application fonctionne alors sans bibliothèque).
export function useBibliotheque(etablissementId: string | null) {
  return useQuery({
    queryKey: [BIBLIOTHEQUE_QUERY_KEY, etablissementId],
    queryFn: async (): Promise<{ disponible: boolean; annees: AnneeArchivee[] }> => {
      const { data, error } = await supabase
        .from('annees_archivees')
        .select('*')
        .eq('etablissement_id', etablissementId!)
        .order('annee_scolaire', { ascending: false })
      if (error) {
        if (tableAbsente(error)) return { disponible: false, annees: [] }
        throw error
      }
      return { disponible: true, annees: data }
    },
    enabled: !!etablissementId,
  })
}

// Emplois du temps disponibles pour Comparer et Apprendre d'un modèle : les versions de l'année en cours
// puis les années de la bibliothèque.
export function useSourcesEmploiDuTemps(etablissementId: string | null) {
  const versions = useQuery({
    queryKey: ['versions_comparaison', etablissementId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('emploi_du_temps_versions')
        .select('id, label, nb_seances, created_at, seances')
        .eq('etablissement_id', etablissementId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
    enabled: !!etablissementId,
  })
  const bibliotheque = useBibliotheque(etablissementId)
  const pret = versions.data !== undefined && bibliotheque.data !== undefined
  // Liste stable d'un rendu à l'autre (les écrans en dérivent des calculs mémorisés)
  const sources = useMemo<SourceEmploiDuTemps[] | undefined>(
    () =>
      versions.data && bibliotheque.data
        ? [...versions.data.map((v) => ({ ...v, provenance: 'version' as const })), ...bibliotheque.data.annees.map(archiveCommeSource)]
        : undefined,
    [versions.data, bibliotheque.data],
  )
  return { sources, isLoading: !pret }
}
