import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { NIVEAUX_ETABLISSEMENT } from '@/lib/horairesReference'
import { cycleForNiveau, type Cycle } from '@/lib/cycle'
import { lireRegles, type ReglesPedagogiques } from '@/lib/regles'
import { buildSlots, type Slot } from '@/lib/scheduling/slots'
import { classeLabel } from '@/lib/timetable'

export interface ClasseOption {
  key: string
  label: string
  niveau: string
  section: number
  cycle: Cycle
}

export const EMPLOI_DU_TEMPS_QUERY_KEY = 'emploi_du_temps_data'

// Erreur PostgREST "table inconnue" (migration pas encore appliquée)
export function tableAbsente(error: { code?: string; message?: string }): boolean {
  return error.code === 'PGRST205' || error.code === '42P01' || /does not exist|schema cache/i.test(error.message ?? '')
}

// Toutes les données nécessaires pour afficher / imprimer / analyser l'emploi du temps d'un établissement,
// chargées en une fois (quelques centaines de lignes) et partagées par les écrans.
export function useEmploiDuTempsData(etablissementId: string | null) {
  return useQuery({
    queryKey: [EMPLOI_DU_TEMPS_QUERY_KEY, etablissementId],
    queryFn: async () => {
      const id = etablissementId!
      const [creneaux, contraintes, seances, professeurs, salles, classesDetails, classes, indisponibilites] = await Promise.all([
        supabase.from('creneaux_horaires').select('*').eq('etablissement_id', id).order('heure_debut'),
        supabase.from('horaires_contraintes').select('*').eq('etablissement_id', id),
        supabase.from('emploi_du_temps').select('*').eq('etablissement_id', id),
        supabase.from('professeurs').select('*').eq('etablissement_id', id).order('nom_complet'),
        supabase.from('salles').select('*').eq('etablissement_id', id).order('nom'),
        supabase.from('classes_details').select('*').eq('etablissement_id', id),
        supabase.from('classes_etablissement').select('niveau, nombre_classes').eq('etablissement_id', id),
        supabase.from('professeur_indisponibilites').select('*').eq('etablissement_id', id),
      ])
      for (const res of [creneaux, contraintes, seances, professeurs, classes, indisponibilites]) {
        if (res.error) throw res.error
      }
      // Salles et détail des classes sont facultatifs : si la base n'a pas encore la migration qui les crée
      // (table introuvable), on continue simplement sans eux.
      for (const res of [salles, classesDetails]) {
        if (res.error && !tableAbsente(res.error)) throw res.error
      }
      salles.data ??= []
      classesDetails.data ??= []

      const ordreNiveau = (key: string) => NIVEAUX_ETABLISSEMENT.findIndex((n) => n.key === key)
      const classeOptions: ClasseOption[] = [...classes.data!]
        .sort((a, b) => ordreNiveau(a.niveau) - ordreNiveau(b.niveau))
        .flatMap((c) =>
          Array.from({ length: c.nombre_classes }, (_, i) => ({
            key: `${c.niveau}-${i + 1}`,
            label: classeLabel(c.niveau, i + 1),
            niveau: c.niveau,
            section: i + 1,
            cycle: cycleForNiveau(c.niveau),
          })),
        )

      const reglesByCycle = {} as Record<Cycle, ReglesPedagogiques>
      const slotsByCycle = {} as Record<Cycle, Slot[]>
      for (const cycle of ['college', 'lycee'] as Cycle[]) {
        const contrainte = contraintes.data!.find((c) => c.cycle === cycle)
        reglesByCycle[cycle] = lireRegles(contrainte?.regles)
        slotsByCycle[cycle] = contrainte
          ? buildSlots(creneaux.data!, cycle, contrainte.jours_cours, contrainte.mercredi_apres_midi_banalise)
          : []
      }

      // Un professeur peut avoir plusieurs fiches (une par matière) : on regroupe par nom.
      const professeurIdsParNom = new Map<string, string[]>()
      for (const p of professeurs.data!) {
        professeurIdsParNom.set(p.nom_complet, [...(professeurIdsParNom.get(p.nom_complet) ?? []), p.id])
      }

      return {
        creneaux: creneaux.data!,
        contraintes: contraintes.data!,
        seances: seances.data!,
        professeurs: professeurs.data!,
        salles: salles.data!,
        classesDetails: classesDetails.data!,
        indisponibilites: indisponibilites.data!,
        classeOptions,
        reglesByCycle,
        slotsByCycle,
        professeurIdsParNom,
        profNameById: Object.fromEntries(professeurs.data!.map((p) => [p.id, p.nom_complet])) as Record<string, string>,
        salleNomById: Object.fromEntries(salles.data!.map((s) => [s.id, s.nom])) as Record<string, string>,
      }
    },
    enabled: !!etablissementId,
  })
}

export type EmploiDuTempsData = NonNullable<ReturnType<typeof useEmploiDuTempsData>['data']>
