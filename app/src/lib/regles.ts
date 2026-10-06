import type { Json } from '@/lib/database.types'

// Règles pédagogiques activables (Paramètres > Horaires & contraintes), enregistrées par cycle dans
// `horaires_contraintes.regles`. Les clés absentes en base prennent la valeur par défaut ci-dessous :
// ajouter une règle ne demande donc aucune migration.
//
// Deux natures de règles :
// - "éviter" (souples) : le moteur les respecte en priorité et ne les relâche qu'en dernier recours,
//   plutôt que de laisser une séance non placée. Chaque entorse est consignée dans le rapport.
// - "prioritaires" (strictes) : respectées tant que possible ; relâchées seulement si, sinon, des heures
//   de la grille horaire de référence seraient perdues (la grille passe avant tout). Écart signalé.
export interface ReglesPedagogiques {
  // e. Ne pas enchaîner deux disciplines littéraires (Français, Anglais, LV2...) — souple
  pasEnchainerLangues: { actif: boolean; matieres: string[] }
  // f. Ne pas enchaîner deux disciplines scientifiques (Mathématiques, PC, SVT) — souple
  pasEnchainerSciences: { actif: boolean; matieres: string[] }
  // g. Éviter qu'une récréation/le déjeuner coupe un double cours ; `autoriserException` = en dernier
  //    recours seulement (sinon la coupure est strictement interdite)
  eviterCoupurePause: { actif: boolean; autoriserException: boolean }
  // h. Pas deux séances de la même discipline dans la même journée — souple
  uneSeanceParJour: { actif: boolean }
  // h. Au moins N disciplines différentes par journée de cours — vérifiée et signalée dans le rapport
  minDisciplinesParJour: { actif: boolean; minimum: number }
  // Plusieurs professeurs d'une même matière dans une même classe (ex. LV2 Allemand / Espagnol) =
  // groupes en parallèle (tandem) au lieu de séances successives pour toute la classe
  tandemsAutomatiques: { actif: boolean }
}

export const MATIERES_LANGUES_DEFAUT = ['Français', 'Anglais', 'L.V.2 (All./Esp.)']
export const MATIERES_SCIENCES_DEFAUT = ['Mathématiques', 'Physique-Chimie', 'S.V.T.']

export const REGLES_DEFAUT: ReglesPedagogiques = {
  pasEnchainerLangues: { actif: true, matieres: MATIERES_LANGUES_DEFAUT },
  pasEnchainerSciences: { actif: true, matieres: MATIERES_SCIENCES_DEFAUT },
  eviterCoupurePause: { actif: true, autoriserException: true },
  uneSeanceParJour: { actif: true },
  minDisciplinesParJour: { actif: true, minimum: 3 },
  tandemsAutomatiques: { actif: true },
}

// Fusionne ce qui est enregistré en base (éventuellement partiel ou ancien) avec les valeurs par défaut.
export function lireRegles(raw: Json | null | undefined): ReglesPedagogiques {
  const stored = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>
  const result = structuredClone(REGLES_DEFAUT) as unknown as Record<string, Record<string, unknown>>
  for (const key of Object.keys(result)) {
    const value = stored[key]
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = { ...result[key], ...(value as Record<string, unknown>) }
    }
  }
  return result as unknown as ReglesPedagogiques
}

export interface RegleDescription {
  key: keyof ReglesPedagogiques
  titre: string
  description: string
  nature: 'souple' | 'stricte' | 'contrôle'
}

export const REGLES_DESCRIPTIONS: RegleDescription[] = [
  {
    key: 'pasEnchainerLangues',
    titre: 'Ne pas enchaîner les disciplines littéraires',
    description:
      "Deux disciplines de cette liste ne se suivent pas sans pause, quel que soit l'ordre — on intercale une matière scientifique, l'HG ou l'EDHC pour éviter la surcharge cognitive.",
    nature: 'souple',
  },
  {
    key: 'pasEnchainerSciences',
    titre: 'Ne pas enchaîner les disciplines scientifiques',
    description:
      "Deux disciplines de cette liste ne se suivent pas sans pause, quel que soit l'ordre — on intercale une langue pour aérer l'esprit des apprenants.",
    nature: 'souple',
  },
  {
    key: 'eviterCoupurePause',
    titre: 'Pas de double cours coupé par une pause',
    description:
      "Une séance de 2h (ou un tandem de 3h) n'est pas fractionnée par la récréation ou le déjeuner tant que c'est possible.",
    nature: 'souple',
  },
  {
    key: 'uneSeanceParJour',
    titre: 'Une seule séance par discipline et par jour',
    description: "Éviter deux séances de la même discipline dans la même journée (anti-pédagogique).",
    nature: 'souple',
  },
  {
    key: 'minDisciplinesParJour',
    titre: 'Disciplines différentes par jour',
    description: "Une journée n'est validée que si elle compte au moins ce nombre de disciplines différentes.",
    nature: 'contrôle',
  },
  {
    key: 'tandemsAutomatiques',
    titre: 'Groupes en parallèle (tandem) automatiques',
    description:
      "Quand plusieurs professeurs enseignent la même matière à une même classe (ex. LV2 Allemand / Espagnol), leurs groupes ont cours en même temps dans des salles différentes.",
    nature: 'stricte',
  },
]
