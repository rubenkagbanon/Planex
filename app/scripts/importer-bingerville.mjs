// Met les données Planex de l'établissement en conformité avec ses emplois du temps réels (JSON produit par
// extraire-edt-pdf.mjs) et enregistre cet emploi du temps réel comme VERSION consultable dans l'application
// (Vue d'ensemble › Réel vs généré).
//
//   PLANEX_EMAIL=... PLANEX_PASSWORD=... node scripts/importer-bingerville.mjs ../source/emplois_du_temps_reels.json
//
// Passe par l'API Supabase avec le compte fourni : les règles d'accès (RLS) s'appliquent, seul l'établissement
// de ce compte est modifié. Le script est rejouable (il met à jour, il ne duplique pas).
//
// Ce qui est importé :
//   - fiches professeurs : classes exactes de chaque (professeur, matière) et volume horaire réel
//   - salles réelles (S1…, LABO1, INFO1) + un terrain pour l'EPS ; TICE en salle informatique
//   - professeur principal et salle attitrée (la plus utilisée) de chaque classe
//   - troncs communs EPS observés (deux classes d'un même cycle ensemble sur le terrain)
//   - en-tête des documents (ministère, DRENA, code, statut, contacts, signataire, année 2023-2024)
//   - l'emploi du temps réel lui-même, comme version
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

const fichier = process.argv[2] ?? '../source/emplois_du_temps_reels.json'
const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => l.trim().split('=')),
)
const URL_API = env.VITE_SUPABASE_URL
const CLE = env.VITE_SUPABASE_ANON_KEY
const { PLANEX_EMAIL, PLANEX_PASSWORD } = process.env
if (!PLANEX_EMAIL || !PLANEX_PASSWORD) throw new Error('Définir PLANEX_EMAIL et PLANEX_PASSWORD.')

const LABEL_VERSION = 'Emploi du temps réel 2023-2024 (PDF de l’établissement)'
const ORDRE_NIVEAUX = ['6e', '5e', '4e', '3e', '2ndeA', '2ndeC', '1reA1', '1reA2', '1reC', '1reD', 'TleA1', 'TleA2', 'TleC', 'TleD']
const COLLEGE = new Set(['6e', '5e', '4e', '3e'])

const session = await fetch(`${URL_API}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: CLE, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: PLANEX_EMAIL, password: PLANEX_PASSWORD }),
}).then((r) => r.json())
if (!session.access_token) throw new Error(`Connexion refusée : ${JSON.stringify(session)}`)

async function api(chemin, { method = 'GET', body, prefer } = {}) {
  const res = await fetch(`${URL_API}/rest/v1/${chemin}`, {
    method,
    headers: {
      apikey: CLE,
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const texte = await res.text()
  if (!res.ok) throw new Error(`${method} ${chemin} → ${res.status} ${texte}`)
  return texte ? JSON.parse(texte) : null
}

const reel = JSON.parse(readFileSync(fichier, 'utf8'))
const [moi] = await api(`profiles?select=etablissement_id&id=eq.${session.user.id}`)
const etab = moi.etablissement_id
const parNiveau = (a, b) => {
  const [na, sa] = a.split('-')
  const [nb, sb] = b.split('-')
  return ORDRE_NIVEAUX.indexOf(na) - ORDRE_NIVEAUX.indexOf(nb) || Number(sa) - Number(sb)
}
const niveauDe = (classe) => classe.split('-')[0]
const cycleDe = (classe) => (COLLEGE.has(niveauDe(classe)) ? 'college' : 'lycee')
const seances = Object.entries(reel).flatMap(([classe, c]) => c.seances.map((s) => ({ ...s, classe })))

// 1. En-tête des documents (identique aux PDF)
await api(`etablissements?id=eq.${etab}`, {
  method: 'PATCH',
  body: {
    ministere: "MINISTERE DE L'EDUCATION NATIONALE ET DE L'ALPHABETISATION",
    drena: 'DRENA ABIDJAN 1',
    adresse: '69',
    telephone: '27 22 55 76 47 / 07 07 96 97 81',
    email: 'collegeleconquerant@gmail.com',
    code_etablissement: '010907',
    statut: 'Privé',
    annee_scolaire: '2023-2024',
    signataire_nom: 'Sokodogo Adama',
    signataire_titre: 'Directeur Des Études',
  },
})
console.log('✓ En-tête de l’établissement')

// 2. Fiches professeurs : (professeur, matière) → classes et heures réelles
const norm = (n) => n.toLowerCase().replace(/[.\s]+/g, ' ').trim()
const fiches = await api(`professeurs?select=id,nom_complet,matiere,niveaux&etablissement_id=eq.${etab}`)
const nomEnBase = new Map(fiches.map((f) => [norm(f.nom_complet), f.nom_complet]))
const nomDe = (pdf) => nomEnBase.get(norm(pdf)) ?? pdf
const verite = new Map()
for (const s of seances) {
  const cle = `${nomDe(s.professeur)}|${s.matiere}`
  const v = verite.get(cle) ?? { classes: new Set(), creneaux: new Set() }
  v.classes.add(s.classe)
  v.creneaux.add(`${s.classe}|${s.jour}|${s.debut}`)
  verite.set(cle, v)
}
let modifiees = 0
let creees = 0
for (const [cle, v] of verite) {
  const [nom, matiere] = cle.split('|')
  const niveaux = [...v.classes].sort(parNiveau)
  const fiche = fiches.find((f) => f.nom_complet === nom && f.matiere === matiere)
  if (fiche) {
    if (JSON.stringify([...fiche.niveaux].sort(parNiveau)) !== JSON.stringify(niveaux)) modifiees++
    await api(`professeurs?id=eq.${fiche.id}`, { method: 'PATCH', body: { niveaux, volume_horaire: v.creneaux.size } })
  } else {
    creees++
    await api('professeurs', { method: 'POST', body: { etablissement_id: etab, nom_complet: nom, matiere, niveaux, volume_horaire: v.creneaux.size } })
  }
}
const sansCours = fiches.filter((f) => !verite.has(`${f.nom_complet}|${f.matiere}`))
console.log(`✓ Fiches professeurs : ${modifiees} corrigées, ${creees} créées${sansCours.length ? `, ${sansCours.length} sans aucun cours dans les PDF (laissées telles quelles) : ${sansCours.map((f) => `${f.nom_complet} ${f.matiere}`).join(', ')}` : ''}`)

// 3. Salles
const nomsSalles = [...new Set(seances.map((s) => s.salle).filter(Boolean))]
const typeSalle = (nom) => (/^LABO/i.test(nom) ? 'laboratoire' : /^INFO/i.test(nom) ? 'informatique' : 'classe')
await api('salles?on_conflict=etablissement_id,nom', {
  method: 'POST',
  prefer: 'resolution=merge-duplicates',
  body: [
    ...nomsSalles.map((nom) => ({ etablissement_id: etab, nom, type: typeSalle(nom), capacite: 1 })),
    // L'EPS n'a pas de salle dans les PDF : un terrain pouvant accueillir les 3 professeurs d'EPS à la fois
    { etablissement_id: etab, nom: 'TERRAIN', type: 'sport', capacite: 3 },
  ],
})
await api('matieres_salles?on_conflict=etablissement_id,matiere', {
  method: 'POST',
  prefer: 'resolution=merge-duplicates',
  body: [{ etablissement_id: etab, matiere: 'TICE', type_salle: 'informatique' }],
})
const salles = await api(`salles?select=id,nom&etablissement_id=eq.${etab}`)
const idSalle = new Map(salles.map((s) => [s.nom, s.id]))
console.log(`✓ Salles : ${nomsSalles.length} salles des PDF + TERRAIN ; TICE en salle informatique`)

// 4. Professeur principal et salle attitrée (salle de cours la plus utilisée par la classe)
await api('classes_details?on_conflict=etablissement_id,niveau,section', {
  method: 'POST',
  prefer: 'resolution=merge-duplicates',
  body: Object.entries(reel).map(([classe, c]) => {
    const compte = {}
    for (const s of c.seances) if (s.salle && /^S\d/.test(s.salle)) compte[s.salle] = (compte[s.salle] ?? 0) + 1
    const salle = Object.entries(compte).sort((a, b) => b[1] - a[1])[0]?.[0]
    const [niveau, section] = classe.split('-')
    return {
      etablissement_id: etab,
      niveau,
      section: Number(section),
      professeur_principal: c.professeurPrincipal,
      salle_id: salle ? idSalle.get(salle) : null,
      updated_at: new Date().toISOString(),
    }
  }),
})
console.log('✓ Professeurs principaux et salles attitrées')

// 5. Troncs communs EPS observés : un même professeur avec deux classes du même cycle sur le même créneau,
//    pendant tout le volume d'EPS. (Les autres chevauchements des PDF sont de vrais conflits, pas des
//    regroupements : ils ne sont pas déclarés.)
const parCreneauProf = new Map()
for (const s of seances.filter((x) => x.matiere === 'E.P.S.')) {
  const cle = `${s.professeur}|${s.jour}|${s.debut}`
  parCreneauProf.set(cle, [...(parCreneauProf.get(cle) ?? []), s.classe])
}
const groupesEps = new Map()
for (const [cle, classes] of parCreneauProf) {
  const uniques = [...new Set(classes)].sort(parNiveau)
  if (uniques.length < 2 || new Set(uniques.map(cycleDe)).size > 1) continue
  const k = `${cle.split('|')[0]}|${uniques.join(',')}`
  groupesEps.set(k, (groupesEps.get(k) ?? 0) + 1)
}
const libelleClasse = (c) => {
  const [n, s] = c.split('-')
  return `${n.replace(/^(\d)e$/, '$1e').replace('2nde', '2nde ').replace('1re', '1re ').replace('Tle', 'Tle ')} ${s}`.replace(/\s+/g, ' ')
}
const anciens = await api(`regroupements?select=id,libelle&etablissement_id=eq.${etab}`)
for (const r of anciens.filter((x) => x.libelle?.startsWith('EPS réel'))) await api(`regroupements?id=eq.${r.id}`, { method: 'DELETE' })
const troncs = [...groupesEps].filter(([, heures]) => heures >= 2)
if (troncs.length > 0) {
  await api('regroupements', {
    method: 'POST',
    body: troncs.map(([k]) => {
      const [prof, classes] = k.split('|')
      const liste = classes.split(',')
      return {
        etablissement_id: etab,
        type: 'tronc_commun',
        libelle: `EPS réel ${liste.map(libelleClasse).join(' + ')} (${prof})`,
        matieres: ['E.P.S.'],
        classes: liste,
      }
    }),
  })
}
console.log(`✓ Troncs communs EPS : ${troncs.length}`)

// 6. L'emploi du temps réel comme version (format de `enregistrer_version`)
const groupes = new Map()
const cleGroupe = (s) =>
  s.tandem ? `tandem|${s.classe}|${s.jour}|${s.debut}` : `${s.professeur}|${s.matiere}|${s.salle ?? ''}|${s.jour}|${s.debut}`
for (const s of seances) groupes.set(cleGroupe(s), [...(groupes.get(cleGroupe(s)) ?? []), s])
const uuidGroupe = new Map([...groupes].filter(([, l]) => new Set(l.map((s) => `${s.classe}|${s.professeur}`)).size > 1).map(([k]) => [k, randomUUID()]))
const lignesVersion = seances.map((s) => {
  const [niveau, section] = s.classe.split('-')
  return {
    cycle: cycleDe(s.classe),
    jour: s.jour,
    heure_debut: s.debut,
    niveau,
    section: Number(section),
    matiere: s.matiere,
    professeur_nom: nomDe(s.professeur),
    salle_nom: s.salle,
    verrouille: false,
    groupe_seance: uuidGroupe.get(cleGroupe(s)) ?? null,
  }
})
const versions = await api(`emploi_du_temps_versions?select=id&etablissement_id=eq.${etab}&label=eq.${encodeURIComponent(LABEL_VERSION)}`)
for (const v of versions) await api(`emploi_du_temps_versions?id=eq.${v.id}`, { method: 'DELETE' })
await api('emploi_du_temps_versions', {
  method: 'POST',
  body: { etablissement_id: etab, label: LABEL_VERSION, nb_seances: lignesVersion.length, seances: lignesVersion },
})
console.log(`✓ Version « ${LABEL_VERSION} » : ${lignesVersion.length} séances`)
