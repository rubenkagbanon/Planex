// Grille horaire officielle — Circulaire N°0311/MENA/CAB/DPFC du 01/09/2025
// "Horaires dans l'enseignement secondaire général", année scolaire 2025-2026.
// Valeurs de départ éditables : à corriger si besoin directement dans l'écran Paramètres.

export interface Niveau {
  key: string
  label: string
}

export const NIVEAUX: Niveau[] = [
  { key: '6e', label: '6e' },
  { key: '5e', label: '5e' },
  { key: '4e', label: '4e' },
  { key: '3e', label: '3e' },
  { key: '2ndeA', label: '2nde A' },
  { key: '2ndeC', label: '2nde C' },
  { key: '1reA', label: '1re A' },
  { key: '1reC', label: '1re C' },
  { key: '1reD', label: '1re D' },
  { key: 'TleA', label: 'Tle A' },
  { key: 'TleC', label: 'Tle C' },
  { key: 'TleD', label: 'Tle D' },
]

// Niveaux réels de l'établissement (Classes, Professeurs) : 1re A et Tle A sont scindées en deux
// classes distinctes chacune (A1/A2, options de spécialité), contrairement à la grille horaire
// officielle qui garde "1re A"/"Tle A" comme colonnes uniques avec des sous-valeurs A1/A2 pour les Maths.
export const NIVEAUX_ETABLISSEMENT: Niveau[] = [
  ...NIVEAUX.slice(0, 6),
  { key: '1reA1', label: '1re A1' },
  { key: '1reA2', label: '1re A2' },
  ...NIVEAUX.slice(7, 9),
  { key: 'TleA1', label: 'Tle A1' },
  { key: 'TleA2', label: 'Tle A2' },
  ...NIVEAUX.slice(10),
]

export const DISCIPLINES = [
  'Anglais',
  'Dessin/Ed.Musicale',
  'E.D.H.C.',
  'E.P.S.',
  'Français',
  'Histoire-Géographie',
  'L.V.2 (All./Esp.)',
  'Mathématiques',
  'TICE',
  'Philosophie',
  'Physique-Chimie',
  'S.V.T.',
] as const

export const DEFAULT_HORAIRES: Record<(typeof DISCIPLINES)[number], Record<string, string>> = {
  Anglais: {
    '6e': '1+1+1', '5e': '1+1+1', '4e': '1+1+1', '3e': '1+1+1',
    '2ndeA': '1+1+1', '2ndeC': '1+1+1', '1reA': '1+1+1', '1reC': '3', '1reD': '1+1+1',
    TleA: '1+1+1', TleC: '2', TleD: '1+1',
  },
  'Dessin/Ed.Musicale': {
    '6e': '', '5e': '', '4e': '', '3e': '',
    '2ndeA': '', '2ndeC': '', '1reA': '', '1reC': '', '1reD': '',
    TleA: '', TleC: '', TleD: '',
  },
  'E.D.H.C.': {
    '6e': '1', '5e': '1', '4e': '1', '3e': '1',
    '2ndeA': '', '2ndeC': '', '1reA': '', '1reC': '', '1reD': '',
    TleA: '', TleC: '', TleD: '',
  },
  'E.P.S.': {
    '6e': '2', '5e': '2', '4e': '2', '3e': '2',
    '2ndeA': '2', '2ndeC': '2', '1reA': '2', '1reC': '2', '1reD': '2',
    TleA: '2', TleC: '2', TleD: '2',
  },
  Français: {
    '6e': '1+2+2', '5e': '1+1+1+2', '4e': '1+1+1+1+2', '3e': '1+1+1+1+2',
    '2ndeA': '1+1+2', '2ndeC': '1+1+2', '1reA': '1+1+2', '1reC': '3', '1reD': '1+2',
    TleA: '1+1+2', TleC: '3', TleD: '1+2',
  },
  'Histoire-Géographie': {
    '6e': '1+1', '5e': '1+1', '4e': '1+1+1', '3e': '1+1+2',
    '2ndeA': '1+1+2', '2ndeC': '1+1+2', '1reA': '1+1+2', '1reC': '4', '1reD': '1+1+2',
    TleA: '1+1+2', TleC: '4', TleD: '1+1+2',
  },
  'L.V.2 (All./Esp.)': {
    '6e': '', '5e': '', '4e': '1+1+1', '3e': '1+1+1',
    '2ndeA': '1+1+1', '2ndeC': '1+1+1', '1reA': '1+1+1', '1reC': '', '1reD': '',
    TleA: '1+1+1', TleC: '', TleD: '',
  },
  Mathématiques: {
    '6e': '1+1+1+1', '5e': '1+1+1+1', '4e': '1+1+2', '3e': '2+1+1',
    '2ndeA': '1+2', '2ndeC': '1+2+2', '1reA': 'A1=4 / A2=1+2', '1reC': '6', '1reD': '1+2+2',
    TleA: 'A1=5 / A2=1+1+2', TleC: '8', TleD: '2+2+2',
  },
  TICE: {
    '6e': '1', '5e': '1', '4e': '1', '3e': '1',
    '2ndeA': '', '2ndeC': '', '1reA': '', '1reC': '', '1reD': '',
    TleA: '', TleC: '', TleD: '',
  },
  Philosophie: {
    '6e': '', '5e': '', '4e': '', '3e': '',
    '2ndeA': '', '2ndeC': '', '1reA': '1+2', '1reC': '2', '1reD': '2',
    TleA: '2+2+2+2', TleC: '3', TleD: '1+2',
  },
  'Physique-Chimie': {
    '6e': '2', '5e': '2', '4e': '2', '3e': '2',
    '2ndeA': '2', '2ndeC': '1+2+2', '1reA': '', '1reC': '1+3+2', '1reD': '1+2+2',
    TleA: '', TleC: '2+2+2', TleD: '1+2+2',
  },
  'S.V.T.': {
    '6e': '2', '5e': '2', '4e': '2', '3e': '2',
    '2ndeA': '2', '2ndeC': '2', '1reA': '2', '1reC': '2', '1reD': '1+2',
    TleA: '2', TleC: '2', TleD: '2+3',
  },
}

// Convertit une cellule ("3", "0+(1h30)", "2 fac", "1+2+(2h)", ...) en minutes.
// Additionne tous les nombres présents (les libellés "fac"/"QZ" sont ignorés, pas les heures).
export function parseCellMinutes(raw: string): number {
  if (!raw) return 0
  let totalMinutes = 0
  const regex = /(\d+)\s*h\s*(\d+)|(\d+)\s*h(?!\d)|(\d+)/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(raw))) {
    if (match[1] !== undefined) {
      totalMinutes += Number(match[1]) * 60 + Number(match[2])
    } else if (match[3] !== undefined) {
      totalMinutes += Number(match[3]) * 60
    } else if (match[4] !== undefined) {
      totalMinutes += Number(match[4]) * 60
    }
  }
  return totalMinutes
}

// Certaines cellules distinguent deux options ("A1=4 / A2=3") : on calcule alors deux totaux séparés.
export function parseCellTracks(raw: string): { a1: number; a2: number } {
  const splitMatch = raw.match(/A1\s*=\s*([^/]+)\/\s*A2\s*=\s*(.+)/i)
  if (splitMatch) {
    return { a1: parseCellMinutes(splitMatch[1]), a2: parseCellMinutes(splitMatch[2]) }
  }
  const minutes = parseCellMinutes(raw)
  return { a1: minutes, a2: minutes }
}

// Une cellule décomposée avec des "+" (ex. "1 + 2h", "1+1+1") décrit des blocs de séances consécutives à
// placer d'un seul tenant, plutôt qu'un simple total : "1+2" = une séance isolée un jour, puis un bloc de
// 2 séances consécutives un autre jour. Le "h" est cosmétique (ignoré, "2h" et "2" valent pareil) ; les
// fractions ("2h30") sont tronquées à l'entier (2) — un bloc est toujours un nombre entier de séances.
// Retourne `null` si la cellule n'est pas décomposée (aucun "+") : le total reste alors interprété comme
// avant (répartition libre de N séances dans la semaine, voir `minutesToPeriods` dans scheduling/charges.ts).
export function parseCellBlocks(raw: string): number[] | null {
  if (!raw.includes('+')) return null
  const blocks = raw
    .split('+')
    .map((term) => term.match(/(\d+)/)?.[1])
    .filter((n): n is string => n !== undefined)
    .map(Number)
    .filter((n) => n > 0)
  return blocks.length > 0 ? blocks : null
}

export function formatMinutes(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (minutes === 0) return String(hours)
  return `${hours}h${String(minutes).padStart(2, '0')}`
}

// Un niveau "établissement" (ex. "1reA1", "TleA2") correspond à une colonne officielle ("1reA", "TleA")
// et, pour les niveaux scindés, à l'une des deux sous-valeurs A1/A2 de la circulaire (Mathématiques
// notamment). Les autres niveaux sont inchangés et n'ont qu'une seule valeur (a1 === a2).
const NIVEAU_ETABLISSEMENT_TRACKS: Record<string, { officiel: string; track: 'a1' | 'a2' }> = {
  '1reA1': { officiel: '1reA', track: 'a1' },
  '1reA2': { officiel: '1reA', track: 'a2' },
  TleA1: { officiel: 'TleA', track: 'a1' },
  TleA2: { officiel: 'TleA', track: 'a2' },
}

// Volume horaire hebdomadaire (en minutes) d'une discipline pour un niveau "établissement" donné,
// en tenant compte de la scission 1re A1/A2 et Tle A1/A2.
export function minutesForNiveauEtablissement(
  grid: Record<string, Record<string, string>>,
  discipline: string,
  niveauEtablissementKey: string,
): number {
  const mapping = NIVEAU_ETABLISSEMENT_TRACKS[niveauEtablissementKey]
  const officiel = mapping?.officiel ?? niveauEtablissementKey
  const track = mapping?.track ?? 'a1'
  const { a1, a2 } = parseCellTracks(grid[discipline]?.[officiel] ?? '')
  return track === 'a1' ? a1 : a2
}

// Même résolution de colonne/track que `minutesForNiveauEtablissement`, mais renvoie le texte brut de la
// cellule (pour en extraire les blocs "+" avec `parseCellBlocks`) plutôt que son total en minutes.
function resolveCellRaw(raw: string, track: 'a1' | 'a2'): string {
  const splitMatch = raw.match(/A1\s*=\s*([^/]+)\/\s*A2\s*=\s*(.+)/i)
  if (!splitMatch) return raw
  return (track === 'a1' ? splitMatch[1] : splitMatch[2]).trim()
}

// Décomposition en blocs de séances consécutives (voir `parseCellBlocks`) pour une discipline et un
// niveau "établissement" donnés — `null` si la cellule n'est pas décomposée avec des "+".
export function blocksForNiveauEtablissement(
  grid: Record<string, Record<string, string>>,
  discipline: string,
  niveauEtablissementKey: string,
): number[] | null {
  const mapping = NIVEAU_ETABLISSEMENT_TRACKS[niveauEtablissementKey]
  const officiel = mapping?.officiel ?? niveauEtablissementKey
  const track = mapping?.track ?? 'a1'
  const raw = resolveCellRaw(grid[discipline]?.[officiel] ?? '', track)
  return parseCellBlocks(raw)
}

// Total d'une colonne (niveau) : somme des cellules de toutes les disciplines pour ce niveau.
export function computeColumnTotal(grid: Record<string, Record<string, string>>, niveauKey: string): string {
  let sumA1 = 0
  let sumA2 = 0
  for (const discipline of DISCIPLINES) {
    const { a1, a2 } = parseCellTracks(grid[discipline]?.[niveauKey] ?? '')
    sumA1 += a1
    sumA2 += a2
  }
  if (sumA1 === sumA2) return formatMinutes(sumA1)
  return `A1=${formatMinutes(sumA1)} / A2=${formatMinutes(sumA2)}`
}

// Total hebdomadaire (toutes disciplines) pour un niveau "établissement" donné (ex. "1reA1", "TleA2") —
// même total que la ligne TOTAL de la grille horaires de référence, déjà résolu sur la bonne sous-valeur
// A1/A2 pour les niveaux scindés.
export function computeColumnTotalForNiveauEtablissement(
  grid: Record<string, Record<string, string>>,
  niveauEtablissementKey: string,
): string {
  let totalMinutes = 0
  for (const discipline of DISCIPLINES) {
    totalMinutes += minutesForNiveauEtablissement(grid, discipline, niveauEtablissementKey)
  }
  return formatMinutes(totalMinutes)
}
