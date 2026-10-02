import { NIVEAUX_ETABLISSEMENT } from '@/lib/horairesReference'
import { JOURS_SEMAINE, type Jour } from '@/lib/joursSemaine'
import type { Cycle } from '@/lib/cycle'
import type { Tables } from '@/lib/database.types'

// Construction des grilles jours × créneaux partagée par le planning, l'impression, l'export Excel et la
// vue d'ensemble — une seule règle d'affichage pour tous les écrans.

export type CreneauRow = Pick<Tables<'creneaux_horaires'>, 'id' | 'cycle' | 'heure_debut' | 'heure_fin' | 'type'>
export type ContrainteRow = Pick<Tables<'horaires_contraintes'>, 'cycle' | 'jours_cours' | 'mercredi_apres_midi_banalise' | 'couleur_matieres'>
export type SeanceRow = Tables<'emploi_du_temps'>

export interface GrilleLigne {
  key: string
  heureDebut: string
  heureFin: string
  type: string
  // Identifiant du créneau correspondant dans chaque cycle (une même ligne peut exister dans les deux)
  idsByCycle: Partial<Record<Cycle, string>>
}

export function formatHeure(hhmmss: string): string {
  return hhmmss.slice(0, 5)
}

export function niveauLabel(niveauKey: string): string {
  return NIVEAUX_ETABLISSEMENT.find((n) => n.key === niveauKey)?.label ?? niveauKey
}

export function classeLabel(niveau: string, section: number): string {
  return `${niveauLabel(niveau)} ${section}`
}

// Une ligne par horaire réel distinct (début/fin/type) : un horaire commun au collège et au lycée n'est
// affiché qu'une fois.
export function construireLignes(creneaux: CreneauRow[], cycles: Cycle[]): GrilleLigne[] {
  const map = new Map<string, GrilleLigne>()
  for (const c of creneaux) {
    if (!cycles.includes(c.cycle as Cycle)) continue
    const key = `${c.heure_debut}|${c.heure_fin}|${c.type}`
    const ligne = map.get(key) ?? { key, heureDebut: c.heure_debut, heureFin: c.heure_fin, type: c.type, idsByCycle: {} }
    ligne.idsByCycle[c.cycle as Cycle] = c.id
    map.set(key, ligne)
  }
  return [...map.values()].sort((a, b) => a.heureDebut.localeCompare(b.heureDebut))
}

export function joursActifs(contraintes: ContrainteRow[], cycles: Cycle[]): Jour[] {
  return JOURS_SEMAINE.filter((j) => contraintes.some((c) => cycles.includes(c.cycle as Cycle) && c.jours_cours.includes(j.key)))
}

// Mercredi après-midi banalisé : la case affiche "Vie scolaire" (activités périscolaires et parascolaires).
export function estVieScolaire(
  jour: string,
  ligne: GrilleLigne,
  contraintes: ContrainteRow[],
  creneaux: CreneauRow[],
  cycles: Cycle[],
): boolean {
  if (jour !== 'mercredi' || ligne.type !== 'cours') return false
  return cycles.every((cycle) => {
    const contrainte = contraintes.find((c) => c.cycle === cycle)
    if (!contrainte?.mercredi_apres_midi_banalise) return false
    const dejeuner = creneaux.find((c) => c.cycle === cycle && c.type === 'dejeuner')?.heure_debut
    return !!dejeuner && ligne.heureDebut > dejeuner
  })
}

export function seancesDeCase(seances: SeanceRow[], jour: string, ligne: GrilleLigne): SeanceRow[] {
  const ids = new Set(Object.values(ligne.idsByCycle))
  return seances.filter((s) => s.jour === jour && ids.has(s.creneau_id))
}

export function libellePause(type: string): string {
  return type === 'recreation' ? 'RÉCRÉATION' : type === 'dejeuner' ? 'PAUSE DÉJEUNER' : ''
}

const ABREVIATIONS: Record<string, string> = {
  Anglais: 'ANG',
  'Dessin/Ed.Musicale': 'DESS',
  'E.D.H.C.': 'EDHC',
  'E.P.S.': 'EPS',
  Français: 'FR',
  'Histoire-Géographie': 'HG',
  'L.V.2 (All./Esp.)': 'LV2',
  Mathématiques: 'MATH',
  TICE: 'TICE',
  Philosophie: 'PHILO',
  'Physique-Chimie': 'PC',
  'S.V.T.': 'SVT',
}

export function abregerMatiere(matiere: string): string {
  return ABREVIATIONS[matiere] ?? matiere.slice(0, 5).toUpperCase()
}
