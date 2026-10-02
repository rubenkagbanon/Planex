import { cycleForNiveau, type Cycle } from '@/lib/cycle'

// Lecture des emplois du temps de classe imprimés en PDF (un fichier par classe, mise en page
// « EMPLOI DU TEMPS CLASSE : 3EME 1 » des logiciels de vie scolaire) : une case contient la matière, la salle
// puis le professeur ; un tandem LV2 s'écrit « ALLEMAND / ESPAGNOL », « S12 / S20 », « Yabo A. R. / Appia A. ».
// La lecture se fait entièrement dans le navigateur : le censeur dépose ses PDF, rien n'est envoyé ailleurs
// tant qu'il n'enregistre pas le résultat.

export interface TextePdf {
  s: string
  x: number // abscisse du début du texte
  y: number
  largeur: number
}

export interface SeancePdf {
  jour: string
  debut: string // "07:45:00"
  fin: string
  matiere: string
  libelle: string
  salle: string | null
  professeur: string | null
  tandem: boolean
}

export interface ClassePdf {
  fichier: string
  niveau: string
  section: number
  cycle: Cycle
  professeurPrincipal: string | null
  heuresAnnoncees: number | null
  heuresLues: number
  seances: SeancePdf[]
  anomalies: string[]
  // Libellés de cases que la lecture n'a pas su rattacher à une matière
  libellesInconnus?: string[]
}

// Libellés imprimés → matières de la grille horaire (comparaison sans accents ni casse)
const MATIERES: Record<string, string> = {
  MATHEMATIQUES: 'Mathématiques',
  MATHS: 'Mathématiques',
  'PH-CH': 'Physique-Chimie',
  'PHYSIQUE-CHIMIE': 'Physique-Chimie',
  PC: 'Physique-Chimie',
  FRANCAIS: 'Français',
  'H.G': 'Histoire-Géographie',
  'H-G': 'Histoire-Géographie',
  HG: 'Histoire-Géographie',
  'HISTOIRE-GEOGRAPHIE': 'Histoire-Géographie',
  EDHC: 'E.D.H.C.',
  'E.D.H.C': 'E.D.H.C.',
  'E.D.H.C.': 'E.D.H.C.',
  ALLEMAND: 'L.V.2 (All./Esp.)',
  ESPAGNOL: 'L.V.2 (All./Esp.)',
  EPS: 'E.P.S.',
  'E.P.S': 'E.P.S.',
  'E.P.S.': 'E.P.S.',
  ANGLAIS: 'Anglais',
  SVT: 'S.V.T.',
  'S.V.T': 'S.V.T.',
  'S.V.T.': 'S.V.T.',
  TICE: 'TICE',
  INFORMATIQUE: 'TICE',
  PHILOSOPHIE: 'Philosophie',
  PHILO: 'Philosophie',
  DESSIN: 'Dessin/Ed.Musicale',
  MUSIQUE: 'Dessin/Ed.Musicale',
  'ARTS PLASTIQUES': 'Dessin/Ed.Musicale',
}

const JOURS = ['LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI']

const normaliser = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim()

function matiereDe(libelle: string): string | undefined {
  return MATIERES[normaliser(libelle)]
}

const estSalle = (s: string) => /^([A-Z]{0,4}\d+|LABO\s*\d*|INFO\s*\d*|AMPHI|TERRAIN)(\s*\/\s*([A-Z]{0,4}\d+|LABO\s*\d*|INFO\s*\d*|AMPHI|TERRAIN))*$/i.test(s)
const estHoraire = (s: string) => /^\d\d[:h]\d\d\s*-\s*\d\d[:h]\d\d$/.test(s)

// "3EME 1" → 3e-1, "2NDE A 1" → 2ndeA-1, "1ERE A2 1" → 1reA2-1, "TLE D 3" → TleD-3
export function codeClasse(titre: string): { niveau: string; section: number } | null {
  const t = normaliser(titre.replace(/^.*CLASSE\s*:\s*/i, ''))
  let m: RegExpMatchArray | null
  if ((m = t.match(/^(\d)\s*EME\s+(\d+)$/))) return { niveau: `${m[1]}e`, section: Number(m[2]) }
  if ((m = t.match(/^2\s*NDE\s+([AC])\s*(\d+)$/))) return { niveau: `2nde${m[1]}`, section: Number(m[2]) }
  if ((m = t.match(/^1\s*ERE\s+(A1|A2|A|C|D)\s*(\d+)$/))) return { niveau: `1re${m[1] === 'A' ? 'A1' : m[1]}`, section: Number(m[2]) }
  if ((m = t.match(/^(?:TLE|TERMINALE)\s+(A1|A2|A|C|D)\s*(\d+)$/))) return { niveau: `Tle${m[1] === 'A' ? 'A1' : m[1]}`, section: Number(m[2]) }
  return null
}

const heure = (h: string) => `${h.replace('h', ':')}:00`

// Analyse le texte positionné d'une page d'emploi du temps de classe.
export function extraireClasse(textes: TextePdf[], fichier: string): ClassePdf | { fichier: string; erreur: string } {
  const titre = textes.find((i) => /EMPLOI DU TEMPS CLASSE/i.test(i.s))
  if (!titre) return { fichier, erreur: "ce n'est pas un emploi du temps de classe (titre « EMPLOI DU TEMPS CLASSE » introuvable)" }
  const code = codeClasse(titre.s)
  if (!code) return { fichier, erreur: `classe non reconnue : « ${titre.s} »` }

  const iPP = textes.findIndex((i) => /^PROFESSEUR PRINCIPAL/i.test(i.s))
  const professeurPrincipal = iPP >= 0 && textes[iPP + 1] ? textes[iPP + 1].s.replace(/\s*\(.*$/, '').trim() || null : null
  const annonce = textes.find((i) => /^\d+\s*H$/i.test(i.s))
  const heuresAnnoncees = annonce ? Number(annonce.s.replace(/\D/g, '')) : null

  // Colonnes des jours : centre de chaque en-tête LUNDI… VENDREDI
  const entetes = JOURS.map((j) => ({ jour: j.toLowerCase(), item: textes.find((i) => normaliser(i.s) === j) }))
    .filter((e): e is { jour: string; item: TextePdf } => !!e.item)
  if (entetes.length < 5) return { fichier, erreur: 'en-têtes des jours (LUNDI… VENDREDI) introuvables' }
  const centre = (i: TextePdf) => i.x + i.largeur / 2
  const jourDe = (i: TextePdf) =>
    entetes.reduce((best, e) => (Math.abs(centre(i) - centre(e.item)) < Math.abs(centre(i) - centre(best.item)) ? e : best)).jour

  const derniereEntete = Math.max(...entetes.map((e) => textes.indexOf(e.item)))
  const corps = textes.slice(derniereEntete + 1)
  const horaires = corps.filter((i) => estHoraire(i.s))
  if (horaires.length === 0) return { fichier, erreur: 'aucun horaire (« 07:45 - 08:35 ») trouvé' }

  const seances: SeancePdf[] = []
  const anomalies: string[] = []
  for (let k = 0; k < corps.length; k++) {
    const it = corps[k]
    let libelles: string[]
    let suivant = k + 1
    const tandem = it.s.match(/^(.+?)\s*\/\s*(.*)$/)
    if (tandem && matiereDe(tandem[1]) && (tandem[2] ? matiereDe(tandem[2]) : corps[k + 1] && matiereDe(corps[k + 1].s))) {
      libelles = [tandem[1].trim(), tandem[2] ? tandem[2].trim() : corps[k + 1].s]
      suivant = tandem[2] ? k + 1 : k + 2
    } else if (matiereDe(it.s)) {
      libelles = [it.s]
    } else continue

    const jour = jourDe(it)
    // Le libellé de la matière est imprimé juste au-dessus de l'horaire de sa ligne
    const ligne = horaires.reduce((best, h) => (Math.abs(it.y - 12 - h.y) < Math.abs(it.y - 12 - best.y) ? h : best))
    const [debut, fin] = ligne.s.split(/\s*-\s*/)

    let salles: string[] = []
    const profs: string[] = []
    let j = suivant
    if (corps[j] && estSalle(corps[j].s)) {
      salles = corps[j].s.split('/').map((s) => s.trim())
      j++
    }
    const debutTandem = (s: string) => !!matiereDe(s.replace(/\s*\/.*$/, ''))
    while (corps[j] && profs.length < libelles.length && !debutTandem(corps[j].s) && !estHoraire(corps[j].s)) {
      for (const p of corps[j].s.split('/')) {
        const nom = p.replace(/\s+/g, ' ').replace(/(\s\.)+$/, '').trim()
        if (nom) profs.push(nom)
      }
      j++
    }
    if (profs.length !== libelles.length) anomalies.push(`${libelles.join(' / ')} (${jour} ${ligne.s}) : professeur illisible`)

    libelles.forEach((libelle, gi) =>
      seances.push({
        jour,
        debut: heure(debut),
        fin: heure(fin),
        matiere: matiereDe(libelle)!,
        libelle: normaliser(libelle),
        salle: salles[gi] ?? salles[0] ?? null,
        professeur: profs[gi] ?? profs[0] ?? null,
        tandem: libelles.length > 1,
      }),
    )
  }

  const heuresLues = new Set(seances.map((s) => `${s.jour}|${s.debut}`)).size
  if (heuresAnnoncees !== null && heuresLues !== heuresAnnoncees) {
    anomalies.push(`${heuresLues}h relues pour ${heuresAnnoncees}h annoncées dans le PDF`)
  }
  return { fichier, ...code, cycle: cycleForNiveau(code.niveau), professeurPrincipal, heuresAnnoncees, heuresLues, seances, anomalies }
}

// Texte positionné de chaque page d'un PDF, lu dans le navigateur avec pdf.js.
export async function lireTextesPdf(fichier: File): Promise<TextePdf[][]> {
  const pdfjs = await import('pdfjs-dist')
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await fichier.arrayBuffer()), verbosity: 0 }).promise
  const pages: TextePdf[][] = []
  for (let n = 1; n <= doc.numPages; n++) {
    const contenu = await (await doc.getPage(n)).getTextContent()
    pages.push(
      contenu.items
        .filter((i): i is typeof i & { str: string; transform: number[]; width: number } => 'str' in i && !!i.str.trim())
        .map((i) => ({ s: i.str.trim(), x: Math.round(i.transform[4]), y: Math.round(i.transform[5]), largeur: i.width })),
    )
  }
  return pages
}

export interface LigneVersion {
  cycle: string
  jour: string
  heure_debut: string
  // Absente des versions enregistrées avant son ajout : déduite des horaires (voir creneauxDuModele)
  heure_fin?: string
  niveau: string
  section: number
  matiere: string
  professeur_nom: string
  salle_nom: string | null
  groupe_seance: string | null
}

// Lignes au format d'une version d'emploi du temps (table emploi_du_temps_versions). Les groupes d'un
// tandem partagent un même `groupe_seance` ; deux classes qui ont le même professeur, la même matière et
// le même horaire sont réunies en tronc commun.
export function versLignesVersion(classes: ClassePdf[]): LigneVersion[] {
  const lignes: LigneVersion[] = []
  const groupes = new Map<string, string>()
  const idGroupe = (cle: string) => {
    if (!groupes.has(cle)) groupes.set(cle, typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${groupes.size}-${Date.now()}`)
    return groupes.get(cle)!
  }
  const parMoment = new Map<string, number>()
  for (const c of classes) for (const s of c.seances) {
    const cle = `${(s.professeur ?? '').toLowerCase()}|${s.matiere}|${s.jour}|${s.debut}`
    parMoment.set(cle, (parMoment.get(cle) ?? 0) + 1)
  }
  for (const c of classes) {
    for (const s of c.seances) {
      const cleProf = `${(s.professeur ?? '').toLowerCase()}|${s.matiere}|${s.jour}|${s.debut}`
      const groupe = s.tandem
        ? idGroupe(`tandem|${c.niveau}-${c.section}|${s.jour}|${s.debut}`)
        : s.professeur && (parMoment.get(cleProf) ?? 0) > 1
          ? idGroupe(`tronc|${cleProf}`)
          : null
      lignes.push({
        cycle: c.cycle,
        jour: s.jour,
        heure_debut: s.debut,
        heure_fin: s.fin,
        niveau: c.niveau,
        section: c.section,
        matiere: s.matiere,
        professeur_nom: s.professeur ?? '?',
        salle_nom: s.salle,
        groupe_seance: groupe,
      })
    }
  }
  return lignes
}

// --- Format « grille » générique : jours en colonnes, horaires en lignes ------------------------------------
// Convient aux tableaux faits sous Word, Excel ou un logiciel de vie scolaire, une ou plusieurs classes par
// PDF (une page par classe) : « CLASSE : 6e1 », éventuellement « SALLE : 12 » et la liste des professeurs par
// matière (« PC : M. KOUADIO », « PP : … »), puis LUNDI… VENDREDI et une ligne par horaire (« 07H30-08H25 »).
// Une case contient la matière (abréviation), parfois la salle (« MATH S9 ») ou le professeur ; « SVT/PC » =
// deux groupes en parallèle. Les libellés inconnus sont signalés : le censeur indique la matière
// correspondante (voir `correspondances`), retenue pour les imports suivants.

// Abréviations courantes (comparées sans espaces, points, tirets ni accents)
export const ABREVIATIONS: Record<string, string> = {
  FR: 'Français',
  FRA: 'Français',
  FRANC: 'Français',
  FRANCAIS: 'Français',
  MATH: 'Mathématiques',
  MATHS: 'Mathématiques',
  MATHEMATIQUES: 'Mathématiques',
  MATHEMATIQUE: 'Mathématiques',
  ANG: 'Anglais',
  ANGL: 'Anglais',
  ANGLAIS: 'Anglais',
  HG: 'Histoire-Géographie',
  HISTGEO: 'Histoire-Géographie',
  HISTOIREGEO: 'Histoire-Géographie',
  HISTOIREGEOGRAPHIE: 'Histoire-Géographie',
  EDHC: 'E.D.H.C.',
  ECM: 'E.D.H.C.',
  EPS: 'E.P.S.',
  SPORT: 'E.P.S.',
  SVT: 'S.V.T.',
  PC: 'Physique-Chimie',
  PCT: 'Physique-Chimie',
  PHCH: 'Physique-Chimie',
  PHYSIQUE: 'Physique-Chimie',
  PHYSIQUECHIMIE: 'Physique-Chimie',
  SCPHY: 'Physique-Chimie',
  ESP: 'L.V.2 (All./Esp.)',
  ESPA: 'L.V.2 (All./Esp.)',
  ESPAGNOL: 'L.V.2 (All./Esp.)',
  ALL: 'L.V.2 (All./Esp.)',
  ALLE: 'L.V.2 (All./Esp.)',
  ALLEMAND: 'L.V.2 (All./Esp.)',
  LV2: 'L.V.2 (All./Esp.)',
  PHILO: 'Philosophie',
  PHILOSOPHIE: 'Philosophie',
  TICE: 'TICE',
  INFO: 'TICE',
  INFORMATIQUE: 'TICE',
  DESSIN: 'Dessin/Ed.Musicale',
  ARTS: 'Dessin/Ed.Musicale',
  ARTSPLASTIQUES: 'Dessin/Ed.Musicale',
  MUSIQUE: 'Dessin/Ed.Musicale',
  EDMUS: 'Dessin/Ed.Musicale',
}
// Correspondance « ce libellé n'est pas une matière » (ex. « ÉTUDE », « PERMANENCE ») : la case est ignorée
export const IGNORER = '__ignorer__'

export const cleLibelle = (s: string) => normaliser(s).replace(/[\s.\-’'_]/g, '')

// « 07H30-08H25 », « 09H20- 10H15 », « 07:45 - 08:35 », « 7h30 à 8h25 »
const HORAIRE = /^(\d{1,2})\s*[Hh:]\s*(\d{2})\s*(?:-|–|à|A)\s*(\d{1,2})\s*[Hh:]\s*(\d{2})$/
const versHeure = (h: string, m: string) => `${h.padStart(2, '0')}:${m}:00`

interface LignePdf {
  y: number
  items: TextePdf[]
  texte: string
}

// Regroupe les textes d'une page en lignes (même ordonnée, à quelques points près), de gauche à droite.
function lignesDe(textes: TextePdf[]): LignePdf[] {
  const lignes: LignePdf[] = []
  for (const t of [...textes].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const ligne = lignes.find((l) => Math.abs(l.y - t.y) <= 6)
    if (ligne) ligne.items.push(t)
    else lignes.push({ y: t.y, items: [t], texte: '' })
  }
  for (const l of lignes) {
    l.items.sort((a, b) => a.x - b.x)
    l.texte = l.items.map((i) => i.s).join(' ').replace(/\s+/g, ' ').trim()
  }
  return lignes
}

// « 6e1 », « 6 e 1 », « 6ème 2 », « 2ndC », « 2nde A 1 », « 1ereA », « TleD2 » → niveau et section (1 par défaut)
export function codeClasseCompact(texte: string): { niveau: string; section: number } | null {
  const t = normaliser(texte).replace(/\s+/g, '')
  let m: RegExpMatchArray | null
  if ((m = t.match(/^([3-6])(?:E|EME|IEME)(\d*)$/))) return { niveau: `${m[1]}e`, section: Number(m[2] || 1) }
  if ((m = t.match(/^2(?:ND|NDE)([AC])(\d*)$/))) return { niveau: `2nde${m[1]}`, section: Number(m[2] || 1) }
  if ((m = t.match(/^1(?:ERE|RE|ER)(A1|A2|A|C|D)(\d*)$/))) return { niveau: `1re${m[1] === 'A' ? 'A1' : m[1]}`, section: Number(m[2] || 1) }
  if ((m = t.match(/^(?:TLE|TERMINALE|TERM|T)(A1|A2|A|C|D)(\d*)$/))) return { niveau: `Tle${m[1] === 'A' ? 'A1' : m[1]}`, section: Number(m[2] || 1) }
  return null
}

// « M.N’DRI » → « M. N’DRI », « M. Mme KADJA » → « Mme KADJA » (civilité en double)
export function nettoyerNom(nom: string): string {
  return nom
    .replace(/\b(M|Mr|Mme|Mlle|Melle|Dr)\.(?=\S)/g, '$1. ')
    .replace(/^(?:M\.?|Mr\.?)\s+(?=(?:Mme|Mlle|Melle)\b)/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const nomSalle = (s: string) => {
  const v = s.trim().toUpperCase().replace(/\s+/g, '')
  return /^\d+$/.test(v) ? `S${v}` : v
}

export interface OptionsLecture {
  // Libellés propres à l'établissement → matière (clé : `cleLibelle(libellé)`), choisis par le censeur
  correspondances?: Record<string, string>
}

export interface ErreurPdf {
  fichier: string
  erreur: string
}

type ResultatPage = ClassePdf | ErreurPdf | null

export function extraireGrille(textes: TextePdf[], fichier: string, options: OptionsLecture = {}): ResultatPage {
  const matiereDeLibelle = (s: string) => options.correspondances?.[cleLibelle(s)] ?? ABREVIATIONS[cleLibelle(s)] ?? matiereDe(s)
  const lignes = lignesDe(textes)
  const entete = lignes.find((l) => ['LUNDI', 'MARDI', 'MERCREDI'].every((j) => l.items.some((i) => normaliser(i.s) === j)))
  if (!entete) return null
  // Lignes horaires : sous l'en-tête des jours, commençant par un horaire (texte isolé ou recollé)
  const horaires = lignes
    .filter((l) => l.y < entete.y)
    .map((l) => {
      const debutLigne = l.items.filter((i) => i.x < (entete.items[0]?.x ?? Infinity) - 4)
      return { l, m: normaliser(debutLigne.map((i) => i.s).join(' ')).match(HORAIRE) }
    })
    .filter((h): h is { l: LignePdf; m: RegExpMatchArray } => !!h.m)
  if (horaires.length === 0) return null

  // Classe : « CLASSE : 6e1 » (la salle peut être sur la même ligne), sinon un titre du type « 6ème 1 »
  const ligneClasse = lignes.find((l) => /^CLASSE\b/.test(normaliser(l.texte)) && l.y > entete.y)
  const itemSalle = ligneClasse?.items.find((i) => /^SALLE/.test(normaliser(i.s)))
  const texteClasse = ligneClasse
    ? ligneClasse.items
        .filter((i) => !itemSalle || i.x < itemSalle.x)
        .map((i) => i.s)
        .join('')
        .replace(/^.*?CLASSE\s*:?/i, '')
    : ''
  const code = codeClasseCompact(texteClasse) ?? (ligneClasse ? null : lignes.filter((l) => l.y > entete.y).map((l) => codeClasseCompact(l.texte)).find(Boolean) ?? null)
  // Page modèle vierge (« CLASSE : » sans rien) : ignorée sans erreur
  if (ligneClasse && !texteClasse.trim()) return null
  if (!code) return { fichier, erreur: `classe non reconnue${texteClasse.trim() ? ` : « ${texteClasse.trim()} »` : ' (aucune mention « CLASSE : … »)'}` }

  // En-tête : salle et professeurs par matière, au-dessus de la ligne des jours
  let salleParDefaut: string | null = null
  const professeurs = new Map<string, string>()
  let professeurPrincipal: string | null = null
  for (const l of lignes.filter((x) => x.y > entete.y)) {
    const texte = l === ligneClasse ? (itemSalle ? l.items.filter((i) => i.x >= itemSalle.x).map((i) => i.s).join(' ') : '') : l.texte
    const m = texte.match(/^([^:]+?)\s*:\s*(.*)$/)
    if (!m) continue
    const cle = cleLibelle(m[1].replace(/\s+M$/i, ''))
    const valeur = m[2].replace(/\s+/g, ' ').trim()
    if (cle === 'SALLE') {
      const salles = valeur.split(/[,;]/).map((s) => s.trim()).filter(Boolean)
      salleParDefaut = salles.length === 1 ? nomSalle(salles[0]) : null
    } else if (cle === 'PP' || cle === 'PROFPRINCIPAL' || cle === 'PROFESSEURPRINCIPAL') {
      professeurPrincipal = valeur ? nettoyerNom(valeur) : null
    } else if (valeur) {
      const matiere = matiereDeLibelle(m[1].replace(/\s+M$/i, ''))
      // « P.C3 », « ANG3 », « ? » : emplacement laissé sans nom dans le modèle du document
      const bouchon = /^[?\-–.\s]*$/.test(valeur) || !!ABREVIATIONS[cleLibelle(valeur).replace(/\d+$/, '')]
      if (matiere && !bouchon) professeurs.set(cle, nettoyerNom(valeur))
    }
  }
  const professeurDe = (libelle: string, matiere: string) => {
    if (professeurs.has(cleLibelle(libelle))) return professeurs.get(cleLibelle(libelle))!
    for (const [c, nom] of professeurs) if ((options.correspondances?.[c] ?? ABREVIATIONS[c]) === matiere) return nom
    return null
  }

  // Colonnes : chaque case commence à peu près sous l'en-tête de son jour (ou centrée dessous)
  const colonnes = JOURS.map((j) => ({ jour: j.toLowerCase(), item: entete.items.find((i) => normaliser(i.s) === j) }))
    .filter((c): c is { jour: string; item: TextePdf } => !!c.item)
    .sort((a, b) => a.item.x - b.item.x)
  const jourDe = (item: TextePdf) => {
    const centre = item.x + item.largeur / 2
    const debut = [...colonnes].reverse().find((c) => item.x >= c.item.x - 12)
    // Un texte centré sous l'en-tête peut commencer avant lui : on prend alors la colonne la plus proche
    if (!debut) return colonnes.reduce((a, b) => (Math.abs(b.item.x + b.item.largeur / 2 - centre) < Math.abs(a.item.x + a.item.largeur / 2 - centre) ? b : a)).jour
    return debut.jour
  }

  const seances: SeancePdf[] = []
  const anomalies: string[] = []
  const inconnus = new Set<string>()
  for (const { l, m } of horaires) {
    const debut = versHeure(m[1], m[2])
    const fin = versHeure(m[3], m[4])
    const parJour = new Map<string, TextePdf[]>()
    for (const item of l.items.filter((i) => i.x >= (entete.items[0]?.x ?? 0) - 20)) {
      const jour = jourDe(item)
      if (jour) parJour.set(jour, [...(parJour.get(jour) ?? []), item])
    }
    for (const [jour, items] of parJour) {
      let texte = items.map((i) => i.s).join(' ').replace(/\s+/g, ' ').trim()
      if (/^(VIE|SCOLAIRE|VIE SCOLAIRE|LIBRE|-+)$/.test(normaliser(texte))) continue
      // Salle en fin de case : « MATH S9 », « H.G S 12 »
      let salle = salleParDefaut
      const s = texte.match(/^(.*?)\s+(S\s*\d+|LABO\s*\d*|SALLE\s*\d+|AMPHI|TERRAIN)$/i)
      if (s) {
        texte = s[1]
        salle = nomSalle(s[2].replace(/^SALLE/i, ''))
      }
      const parties = texte.split('/').map((p) => p.trim()).filter(Boolean)
      // Une case peut aussi contenir « MATIÈRE Professeur » : on cherche la plus longue matière en tête
      const matieres = parties.map((p) => {
        const mots = p.split(' ')
        for (let k = mots.length; k >= 1; k--) {
          const libelle = mots.slice(0, k).join(' ')
          const matiere = matiereDeLibelle(libelle)
          const reste = mots.slice(k).join(' ')
          if (matiere) return { libelle, matiere, prof: reste && !/^[?\-–.]+$/.test(reste) ? reste : null }
        }
        return { libelle: p, matiere: undefined, prof: null }
      })
      const inconnue = matieres.find((x) => !x.matiere)
      if (matieres.length === 0 || inconnue) {
        inconnus.add(inconnue?.libelle ?? texte)
        continue
      }
      for (const x of matieres.filter((y) => y.matiere !== IGNORER)) {
        const professeur = x.prof ? nettoyerNom(x.prof) : professeurDe(x.libelle, x.matiere!)
        if (!professeur) anomalies.push(`${x.libelle} (${jour} ${m[0]}) : aucun professeur indiqué`)
        seances.push({ jour, debut, fin, matiere: x.matiere!, libelle: normaliser(x.libelle), salle, professeur, tandem: matieres.filter((y) => y.matiere !== IGNORER).length > 1 })
      }
    }
  }
  for (const x of inconnus) anomalies.push(`libellé non reconnu : « ${x} »`)
  const heuresLues = new Set(seances.map((x) => `${x.jour}|${x.debut}`)).size
  return {
    fichier,
    ...code,
    cycle: cycleForNiveau(code.niveau),
    professeurPrincipal,
    heuresAnnoncees: null,
    heuresLues,
    seances,
    anomalies,
    libellesInconnus: [...inconnus],
  }
}

// Lit toutes les pages d'un PDF : chaque page est analysée avec la mise en page qu'elle reconnaît.
export function extrairePdf(pages: TextePdf[][], fichier: string, options: OptionsLecture = {}): { classes: ClassePdf[]; erreurs: ErreurPdf[] } {
  const classes: ClassePdf[] = []
  const erreurs: ErreurPdf[] = []
  const totalTextes = pages.reduce((n, p) => n + p.length, 0)
  if (totalTextes === 0) {
    return {
      classes,
      erreurs: [{ fichier, erreur: "ce PDF ne contient pas de texte (document scanné ou photo) : exporte-le directement depuis Word, Excel ou le logiciel d'emploi du temps." }],
    }
  }
  pages.forEach((textes, i) => {
    if (textes.length === 0) return
    const nom = pages.length > 1 ? `${fichier} (page ${i + 1})` : fichier
    const r: ResultatPage = textes.some((t) => /EMPLOI DU TEMPS CLASSE\s*:/i.test(t.s)) ? extraireClasse(textes, nom) : extraireGrille(textes, nom, options)
    if (!r) return
    if ('erreur' in r) erreurs.push(r)
    else if (r.seances.length > 0 || (r.libellesInconnus?.length ?? 0) > 0) classes.push(r)
  })
  if (classes.length === 0 && erreurs.length === 0) {
    erreurs.push({ fichier, erreur: 'aucun emploi du temps de classe reconnu : il faut une grille avec les jours (LUNDI, MARDI…) en colonnes et les horaires (« 07H30-08H25 ») en lignes.' })
  }
  return { classes, erreurs }
}

// Un même professeur est souvent écrit de plusieurs façons d'une page à l'autre (« M. KOUADIO Wilfred » /
// « M. KOUADIO », « M. KADJA » / « Mme KADJA », « GNAMBA » / « M. GNAMBA »). On réunit :
// - les noms identiques à la civilité près, s'ils enseignent une même matière ;
// - un nom court et un nom plus long qui le prolonge (même matière), quand ce nom long est le seul possible.
export function harmoniserProfesseurs(classes: ClassePdf[]): ClassePdf[] {
  const CIVILITE = /^(M\.?|MR\.?|MME\.?|MLLE\.?|MELLE\.?|DR\.?)\s+/i
  const sansCivilite = (n: string) => {
    let s = n.trim()
    while (CIVILITE.test(s)) s = s.replace(CIVILITE, '')
    return s
  }
  const motsDe = (n: string) => normaliser(sansCivilite(n)).replace(/[^A-Z0-9 ]/g, ' ').split(' ').filter(Boolean)
  const matieresParNom = new Map<string, Set<string>>()
  for (const c of classes) for (const s of c.seances) if (s.professeur) {
    matieresParNom.set(s.professeur, (matieresParNom.get(s.professeur) ?? new Set()).add(s.matiere))
  }
  const noms = [...matieresParNom.keys()]
  const partageMatiere = (a: string, b: string) => [...matieresParNom.get(a)!].some((m) => matieresParNom.get(b)!.has(m))
  const parent = new Map<string, string>()
  const racine = (n: string): string => {
    const p = parent.get(n)
    return p && p !== n ? racine(p) : n
  }
  // Nom de référence d'un groupe : le plus complet
  const meilleur = (a: string, b: string) => (motsDe(b).length > motsDe(a).length || (motsDe(b).length === motsDe(a).length && b.length > a.length) ? b : a)
  const unir = (a: string, b: string) => {
    const ra = racine(a)
    const rb = racine(b)
    if (ra === rb) return
    const ref = meilleur(ra, rb)
    parent.set(ra, ref)
    parent.set(rb, ref)
  }
  for (const a of noms) for (const b of noms) {
    if (a < b && partageMatiere(a, b) && motsDe(a).join(' ') && motsDe(a).join(' ') === motsDe(b).join(' ')) unir(a, b)
  }
  for (const court of noms) {
    const mc = motsDe(court)
    if (mc.length === 0) continue
    const longs = noms.filter((n) => {
      const ml = motsDe(n)
      return ml.length > mc.length && mc.every((w, i) => ml[i] === w) && partageMatiere(court, n)
    })
    const distincts = new Set(longs.map(racine))
    if (distincts.size === 1) unir(court, [...distincts][0])
  }
  return classes.map((c) => ({
    ...c,
    seances: c.seances.map((s) => (s.professeur ? { ...s, professeur: racine(s.professeur) } : s)),
  }))
}
