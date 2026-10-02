import { expandNiveauCodes } from '@/lib/classeCode'
import { minutesForNiveauEtablissement } from '@/lib/horairesReference'

// Volume hebdomadaire (en minutes) d'une fiche professeur, recalculé depuis la grille horaire de référence
// et les classes réellement couvertes — même calcul que l'écran Professeurs et le moteur de génération.
// Préféré à la colonne `professeurs.volume_horaire`, qui n'est à jour que si la fiche a été enregistrée
// depuis l'écran (les fiches importées par script peuvent y avoir 0).
export function volumeFicheMinutes(
  fiche: { matiere: string; niveaux: string[] },
  nombreClassesParNiveau: Record<string, number>,
  grid: Record<string, Record<string, string>>,
): number {
  return expandNiveauCodes(fiche.niveaux, nombreClassesParNiveau).reduce(
    (sum, { niveau }) => sum + minutesForNiveauEtablissement(grid, fiche.matiere, niveau),
    0,
  )
}
