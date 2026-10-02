// Extrait les emplois du temps réels (PDF de /source, un par classe) vers un fichier JSON : une entrée par
// séance et par groupe (jour, horaire, matière, salle, professeur), plus le professeur principal et le total
// d'heures annoncé de chaque classe. Le total relu est contrôlé contre le total annoncé dans le PDF.
//
//   node scripts/extraire-edt-pdf.mjs ../source ../source/emplois_du_temps_reels.json
//
// Mise en page attendue : celle des PDF "EMPLOI DU TEMPS CLASSE : 3EME 1" (ECOLEMEDIA) — une case contient la
// matière, la salle puis le professeur ; un tandem LV2 s'écrit "ALLEMAND / ESPAGNOL", "S12 / S20",
// "Yabo A. R. / Appia A.".
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const [dossier = '../source', sortie = '../source/emplois_du_temps_reels.json'] = process.argv.slice(2)

const MATIERES = {
  MATHÉMATIQUES: 'Mathématiques',
  'PH-CH': 'Physique-Chimie',
  FRANÇAIS: 'Français',
  'H.G': 'Histoire-Géographie',
  EDHC: 'E.D.H.C.',
  ALLEMAND: 'L.V.2 (All./Esp.)',
  ESPAGNOL: 'L.V.2 (All./Esp.)',
  EPS: 'E.P.S.',
  ANGLAIS: 'Anglais',
  SVT: 'S.V.T.',
  TICE: 'TICE',
  PHILOSOPHIE: 'Philosophie',
}

// Colonnes des jours (abscisses en points PDF, page A4 portrait)
const JOURS = [
  ['lundi', 115, 207],
  ['mardi', 207, 299],
  ['mercredi', 299, 391],
  ['jeudi', 391, 483],
  ['vendredi', 483, 575],
]

const estSalle = (s) => /^(S\d+|LABO\d*|INFO\d*)(\s*\/\s*(S\d+|LABO\d*|INFO\d*))*$/i.test(s)

function codeClasse(titre) {
  const t = titre.replace(/^.*CLASSE\s*:\s*/, '').trim()
  let m
  if ((m = t.match(/^(\d)EME\s+(\d+)$/))) return `${m[1]}e-${m[2]}`
  if ((m = t.match(/^2NDE\s+([AC])\s+(\d+)$/))) return `2nde${m[1]}-${m[2]}`
  if ((m = t.match(/^1ERE\s+(A1|A2|C|D)\s+(\d+)$/))) return `1re${m[1]}-${m[2]}`
  if ((m = t.match(/^TLE\s+(A1|A2|C|D)\s+(\d+)$/))) return `Tle${m[1]}-${m[2]}`
  throw new Error(`Classe non reconnue : ${t}`)
}

async function lireTextes(fichier) {
  const doc = await getDocument({ data: new Uint8Array(readFileSync(fichier)), verbosity: 0 }).promise
  const page = await doc.getPage(1)
  const contenu = await page.getTextContent()
  return contenu.items
    .filter((i) => i.str.trim())
    .map((i) => ({ s: i.str.trim(), x: Math.round(i.transform[4]), y: Math.round(i.transform[5]) }))
}

const resultat = {}
const anomalies = []

for (const nom of readdirSync(dossier).filter((f) => f.toLowerCase().endsWith('.pdf')).sort()) {
  const textes = await lireTextes(join(dossier, nom))
  const titre = textes.find((i) => i.s.startsWith('EMPLOI DU TEMPS CLASSE'))
  if (!titre) continue
  const classe = codeClasse(titre.s)
  const iPP = textes.findIndex((i) => i.s.startsWith('PROFESSEUR PRINCIPAL'))
  const professeurPrincipal = iPP >= 0 ? textes[iPP + 1].s.replace(/\s*\(.*$/, '').trim() : null
  const heuresAnnoncees = Number(textes.find((i) => /^\d+H$/.test(i.s))?.s.replace('H', ''))
  const corps = textes.slice(textes.findIndex((i) => i.s === 'VENDREDI') + 1)
  const horaires = corps.filter((i) => /^\d\d:\d\d - \d\d:\d\d$/.test(i.s))
  const seances = []

  for (let k = 0; k < corps.length; k++) {
    const it = corps[k]
    let libelles
    let suivant = k + 1
    if (it.s === 'ALLEMAND /' && corps[k + 1]?.s === 'ESPAGNOL') {
      libelles = ['ALLEMAND', 'ESPAGNOL']
      suivant = k + 2
    } else if (MATIERES[it.s]) {
      libelles = [it.s]
    } else continue

    const jour = JOURS.find(([, a, b]) => it.x + 15 >= a && it.x + 15 < b)?.[0]
    // Le libellé de la matière est imprimé ~12 pt au-dessus de l'horaire de sa ligne
    const ligne = horaires.reduce((best, h) => (Math.abs(it.y - 12 - h.y) < Math.abs(it.y - 12 - best.y) ? h : best))
    const [debut, fin] = ligne.s.split(' - ')

    let salles = []
    const profs = []
    let j = suivant
    if (corps[j] && estSalle(corps[j].s)) {
      salles = corps[j].s.split('/').map((s) => s.trim())
      j++
    }
    while (
      corps[j] &&
      profs.length < libelles.length &&
      !MATIERES[corps[j].s] &&
      corps[j].s !== 'ALLEMAND /' &&
      !/^\d\d:\d\d/.test(corps[j].s)
    ) {
      if (corps[j].s !== '/') profs.push(corps[j].s.replace(/\s+/g, ' ').replace(/(\s\.)+$/, '').trim())
      j++
    }
    if (!jour || profs.length !== libelles.length) anomalies.push(`${nom} : ${it.s} ${ligne.s} (jour=${jour}, profs=${profs.join(', ')})`)

    libelles.forEach((libelle, gi) =>
      seances.push({
        jour,
        debut: `${debut}:00`,
        fin: `${fin}:00`,
        matiere: MATIERES[libelle],
        libelle,
        salle: salles[gi] ?? salles[0] ?? null,
        professeur: profs[gi] ?? profs[0] ?? null,
        tandem: libelles.length > 1,
      }),
    )
  }

  const heures = new Set(seances.map((s) => `${s.jour}|${s.debut}`)).size
  if (heures !== heuresAnnoncees) anomalies.push(`${nom} : ${heures}h relues pour ${heuresAnnoncees}h annoncées`)
  resultat[classe] = { fichier: nom, professeurPrincipal, heuresAnnoncees, seances }
}

writeFileSync(sortie, JSON.stringify(resultat, null, 1))
const total = Object.values(resultat).reduce((s, c) => s + c.seances.length, 0)
console.log(`${Object.keys(resultat).length} classes, ${total} séances → ${sortie}`)
console.log(anomalies.length ? `Anomalies :\n  ${anomalies.join('\n  ')}` : 'Aucune anomalie : chaque classe retombe sur son total d’heures annoncé.')
