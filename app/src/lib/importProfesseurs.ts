import { DISCIPLINES, NIVEAUX_ETABLISSEMENT } from '@/lib/horairesReference'

// Lecture d'une liste de professeurs depuis un tableau (fichier Excel/CSV) : une ligne par professeur et
// par matière, colonnes "Nom et prénoms", "Matière", "Classes", "Remarque". Les intitulés de colonnes, de
// matières et de classes sont reconnus de façon tolérante (accents, casse, abréviations courantes).

export interface ProfesseurImporte {
  nomComplet: string
  matiere: string
  // Codes au format de la table `professeurs.niveaux` : "3e" (toutes les classes) ou "3e-2"
  classes: string[]
  remarque: string
}

export interface ResultatImport {
  professeurs: ProfesseurImporte[]
  erreurs: string[]
}

function normaliser(texte: string): string {
  return texte
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const SYNONYMES_MATIERES: Record<string, string> = {
  anglais: 'Anglais',
  ang: 'Anglais',
  francais: 'Français',
  fr: 'Français',
  fra: 'Français',
  mathematiques: 'Mathématiques',
  mathematique: 'Mathématiques',
  maths: 'Mathématiques',
  math: 'Mathématiques',
  'physique chimie': 'Physique-Chimie',
  physique: 'Physique-Chimie',
  pc: 'Physique-Chimie',
  'ph ch': 'Physique-Chimie',
  phch: 'Physique-Chimie',
  svt: 'S.V.T.',
  's v t': 'S.V.T.',
  'sciences de la vie et de la terre': 'S.V.T.',
  hg: 'Histoire-Géographie',
  'h g': 'Histoire-Géographie',
  'histoire geographie': 'Histoire-Géographie',
  'histoire geo': 'Histoire-Géographie',
  edhc: 'E.D.H.C.',
  'e d h c': 'E.D.H.C.',
  eps: 'E.P.S.',
  'e p s': 'E.P.S.',
  sport: 'E.P.S.',
  allemand: 'L.V.2 (All./Esp.)',
  espagnol: 'L.V.2 (All./Esp.)',
  lv2: 'L.V.2 (All./Esp.)',
  'l v 2': 'L.V.2 (All./Esp.)',
  philosophie: 'Philosophie',
  philo: 'Philosophie',
  tice: 'TICE',
  informatique: 'TICE',
  dessin: 'Dessin/Ed.Musicale',
  musique: 'Dessin/Ed.Musicale',
  'education musicale': 'Dessin/Ed.Musicale',
  'arts plastiques': 'Dessin/Ed.Musicale',
}

export function reconnaitreMatiere(brut: string): string | null {
  const n = normaliser(brut)
  if (!n) return null
  const exacte = DISCIPLINES.find((d) => normaliser(d) === n)
  if (exacte) return exacte
  if (SYNONYMES_MATIERES[n]) return SYNONYMES_MATIERES[n]
  const compacte = n.replace(/\s/g, '')
  const parCompacte = Object.entries(SYNONYMES_MATIERES).find(([k]) => k.replace(/\s/g, '') === compacte)
  if (parCompacte) return parCompacte[1]
  if (n.startsWith('l v 2') || n.startsWith('lv2')) return 'L.V.2 (All./Esp.)'
  return null
}

// Clés de niveau compactées (sans espace, en minuscules) → clé de niveau de l'établissement.
const NIVEAUX_COMPACTS: [string, string][] = NIVEAUX_ETABLISSEMENT.map((n) => [n.key.toLowerCase(), n.key] as [string, string]).sort(
  (a, b) => b[0].length - a[0].length,
)

// "3e 2", "3ème2", "3EME 2", "2nde A 1", "1ère A2 1", "Tle D 3", "Terminale D", "6e" → "3e-2", "2ndeA-1", ...
export function reconnaitreClasse(brut: string): string | null {
  let compact = normaliser(brut)
    .replace(/\bterminale\b/g, 'tle')
    .replace(/\bseconde\b/g, '2nde')
    .replace(/\bpremiere\b/g, '1re')
    .replace(/(\d)\s*(eme|e)\b/g, '$1e')
    .replace(/(\d)\s*(ere|re)\b/g, '$1re')
    .replace(/\s/g, '')
  compact = compact.replace(/^(\d)eme/, '$1e').replace(/^1ere/, '1re')
  for (const [cle, niveau] of NIVEAUX_COMPACTS) {
    if (compact.startsWith(cle)) {
      const reste = compact.slice(cle.length)
      if (reste === '') return niveau
      if (/^\d{1,2}$/.test(reste)) return `${niveau}-${Number(reste)}`
    }
  }
  return null
}

function colonne(entetes: string[], ...candidats: string[]): number {
  return entetes.findIndex((e) => candidats.some((c) => normaliser(e).includes(c)))
}

// `lignes` : première ligne = en-têtes, puis une ligne par fiche (tableau brut de cellules).
export function lireProfesseurs(lignes: unknown[][], nombreClassesParNiveau: Record<string, number>): ResultatImport {
  const erreurs: string[] = []
  const professeurs: ProfesseurImporte[] = []
  if (lignes.length === 0) return { professeurs, erreurs: ['Le fichier est vide.'] }

  const entetes = lignes[0].map((c) => String(c ?? ''))
  const iNom = colonne(entetes, 'nom', 'professeur', 'enseignant')
  const iMatiere = colonne(entetes, 'matiere', 'discipline')
  const iClasses = colonne(entetes, 'classe', 'niveau')
  const iRemarque = colonne(entetes, 'remarque', 'observation', 'commentaire')
  if (iNom < 0 || iMatiere < 0 || iClasses < 0) {
    return { professeurs, erreurs: ['Colonnes introuvables : le fichier doit contenir « Nom et prénoms », « Matière » et « Classes » (voir le modèle).'] }
  }

  lignes.slice(1).forEach((ligne, index) => {
    const numero = index + 2
    const nom = String(ligne[iNom] ?? '').trim().replace(/\s+/g, ' ')
    const matieresBrutes = String(ligne[iMatiere] ?? '').trim()
    const classesBrutes = String(ligne[iClasses] ?? '').trim()
    if (!nom && !matieresBrutes && !classesBrutes) return
    if (!nom) {
      erreurs.push(`Ligne ${numero} : nom manquant.`)
      return
    }

    const matieres: string[] = []
    for (const morceau of matieresBrutes.split(/[,;+\n]/).map((m) => m.trim()).filter(Boolean)) {
      const matiere = reconnaitreMatiere(morceau)
      if (matiere) {
        if (!matieres.includes(matiere)) matieres.push(matiere)
      } else erreurs.push(`Ligne ${numero} (${nom}) : matière « ${morceau} » non reconnue.`)
    }
    if (matieres.length === 0) {
      if (!matieresBrutes) erreurs.push(`Ligne ${numero} (${nom}) : matière manquante.`)
      return
    }

    const classes: string[] = []
    for (const morceau of classesBrutes.split(/[,;/\n]/).map((c) => c.trim()).filter(Boolean)) {
      const code = reconnaitreClasse(morceau)
      if (!code) {
        erreurs.push(`Ligne ${numero} (${nom}) : classe « ${morceau} » non reconnue.`)
        continue
      }
      const [niveau, section] = code.split('-')
      const nombre = nombreClassesParNiveau[niveau]
      if (nombre === undefined) {
        erreurs.push(`Ligne ${numero} (${nom}) : le niveau de « ${morceau} » n'est pas activé dans Paramètres > Classes.`)
        continue
      }
      if (section && Number(section) > nombre) {
        erreurs.push(`Ligne ${numero} (${nom}) : « ${morceau} » n'existe pas (le niveau compte ${nombre} classe${nombre > 1 ? 's' : ''}).`)
        continue
      }
      if (!classes.includes(code)) classes.push(code)
    }
    if (classes.length === 0) {
      erreurs.push(`Ligne ${numero} (${nom}) : aucune classe reconnue — fiche ignorée.`)
      return
    }

    const remarque = iRemarque >= 0 ? String(ligne[iRemarque] ?? '').trim() : ''
    for (const matiere of matieres) professeurs.push({ nomComplet: nom, matiere, classes, remarque })
  })

  return { professeurs, erreurs }
}

export const MODELE_ENTETES = ['Nom et prénoms', 'Matière', 'Classes', 'Remarque']

export const MODELE_EXEMPLES = [
  ['Bamba N.', 'Mathématiques', '3e 1, 3e 3, 6e 1', ''],
  ['Kouadio N. A.', 'Allemand', '3e 1, 3e 2, 4e 1', 'Groupe Allemand'],
  ['Kouadio N. A.', 'EDHC', '3e 1, 3e 2', ''],
  ['Signo K.', 'EPS', '2nde C 1, 2nde C 2, Tle D 2', ''],
]
