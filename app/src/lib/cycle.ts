import { NIVEAUX_ETABLISSEMENT } from '@/lib/horairesReference'

export type Cycle = 'college' | 'lycee'

const COLLEGE_NIVEAUX_KEYS = new Set(NIVEAUX_ETABLISSEMENT.slice(0, 4).map((n) => n.key))

export function cycleForNiveau(niveauKey: string): Cycle {
  return COLLEGE_NIVEAUX_KEYS.has(niveauKey) ? 'college' : 'lycee'
}
