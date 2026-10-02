import { normalizeProfesseurNom } from '@/lib/scheduling/solver'
import { classeLabel, type CreneauRow, type SeanceRow } from '@/lib/timetable'

// Édition manuelle de l'emploi du temps (glisser-déposer sur /planning) : calcul des déplacements d'un
// échange et vérification qu'ils ne créent aucun conflit dur — les mêmes règles que le moteur et que le
// garde-fou en base (classe, professeur, salle, indisponibilités).

export interface Deplacement {
  id: string
  jour: string
  creneauId: string
  salleId: string | null
  verrouille?: boolean
}

export interface ContexteEdition {
  creneauById: Map<string, CreneauRow>
  profNameById: Record<string, string>
  salleById: Map<string, { nom: string; capacite: number }>
  indisponibilites: { nom_complet: string; jour: string; creneau_id: string }[]
}

// Lignes qui bougent ensemble : toutes celles de la classe dans la case, plus celles qui partagent leur
// `groupe_seance` (tronc commun : les autres classes réunies ; tandem : les autres groupes).
export function seancesLiees(seances: SeanceRow[], depart: SeanceRow[]): SeanceRow[] {
  const groupes = new Set(depart.map((s) => s.groupe_seance).filter((g): g is string => !!g))
  const ids = new Set(depart.map((s) => s.id))
  return seances.filter((s) => ids.has(s.id) || (s.groupe_seance && groupes.has(s.groupe_seance)))
}

// Créneau équivalent (même horaire) dans le cycle de la séance — une ligne de grille peut regrouper le
// créneau collège et le créneau lycée du même horaire.
function creneauDansCycle(creneauById: Map<string, CreneauRow>, creneauId: string, cycle: string): string | null {
  const reference = creneauById.get(creneauId)
  if (!reference) return null
  if (reference.cycle === cycle) return creneauId
  for (const c of creneauById.values()) {
    if (c.cycle === cycle && c.heure_debut === reference.heure_debut && c.heure_fin === reference.heure_fin && c.type === reference.type) return c.id
  }
  return null
}

// Déplace le contenu d'une case (source) vers une autre (cible) ; si la cible est occupée par la même
// classe, les deux contenus sont échangés.
export function calculerEchange(
  seances: SeanceRow[],
  source: SeanceRow[],
  cible: SeanceRow[],
  destination: { jour: string; creneauId: string },
  origine: { jour: string; creneauId: string },
  creneauById: Map<string, CreneauRow>,
): Deplacement[] | string {
  const aller = seancesLiees(seances, source)
  const retour = seancesLiees(seances, cible)
  const deplacements: Deplacement[] = []
  for (const s of aller) {
    const creneauId = creneauDansCycle(creneauById, destination.creneauId, s.cycle)
    if (!creneauId) return "Ce créneau n'existe pas pour ce cycle."
    deplacements.push({ id: s.id, jour: destination.jour, creneauId, salleId: s.salle_id, verrouille: true })
  }
  for (const s of retour) {
    const creneauId = creneauDansCycle(creneauById, origine.creneauId, s.cycle)
    if (!creneauId) return "Ce créneau n'existe pas pour ce cycle."
    deplacements.push({ id: s.id, jour: origine.jour, creneauId, salleId: s.salle_id, verrouille: true })
  }
  return deplacements
}

export function verifierDeplacements(seances: SeanceRow[], deplacements: Deplacement[], ctx: ContexteEdition): string[] {
  const parId = new Map(deplacements.map((d) => [d.id, d]))
  const apres = seances.map((s) => {
    const d = parId.get(s.id)
    return d ? { ...s, jour: d.jour, creneau_id: d.creneauId, salle_id: d.salleId } : s
  })
  const horaire = (creneauId: string) => {
    const c = ctx.creneauById.get(creneauId)
    return c ? `${c.heure_debut}-${c.heure_fin}` : creneauId
  }
  const indispos = new Set(
    ctx.indisponibilites.map((i) => `${normalizeProfesseurNom(i.nom_complet)}|${i.jour}|${horaire(i.creneau_id)}`),
  )

  const conflits = new Set<string>()
  for (const m of apres.filter((s) => parId.has(s.id))) {
    const quand = horaire(m.creneau_id)
    const nomProf = ctx.profNameById[m.professeur_id] ?? ''
    const memeMoment = apres.filter(
      (o) => o.id !== m.id && o.jour === m.jour && horaire(o.creneau_id) === quand && !(m.groupe_seance && o.groupe_seance === m.groupe_seance),
    )
    for (const o of memeMoment) {
      if (o.niveau === m.niveau && o.section === m.section) {
        conflits.add(`${classeLabel(m.niveau, m.section)} a déjà ${o.matiere} à ce moment.`)
      }
      if (nomProf && normalizeProfesseurNom(ctx.profNameById[o.professeur_id] ?? '') === normalizeProfesseurNom(nomProf)) {
        conflits.add(`${nomProf} a déjà cours avec la ${classeLabel(o.niveau, o.section)} à ce moment.`)
      }
    }
    if (m.salle_id) {
      const salle = ctx.salleById.get(m.salle_id)
      const occupations = new Set(
        apres
          .filter((o) => o.salle_id === m.salle_id && o.jour === m.jour && horaire(o.creneau_id) === quand)
          .map((o) => o.groupe_seance ?? o.id),
      )
      if (salle && occupations.size > salle.capacite) conflits.add(`La salle ${salle.nom} est déjà occupée à ce moment.`)
    }
    if (nomProf && indispos.has(`${normalizeProfesseurNom(nomProf)}|${m.jour}|${quand}`)) {
      conflits.add(`${nomProf} est déclaré indisponible à ce moment.`)
    }
  }
  return [...conflits]
}

// Après un déplacement, une séance dont la salle est déjà occupée au nouvel horaire reçoit une autre salle
// libre du même type (ou aucune salle à défaut, signalé) : la salle ne doit pas bloquer un déplacement.
export function reaffecterSalles(
  seances: SeanceRow[],
  deplacements: Deplacement[],
  salles: { id: string; nom: string; type: string; capacite: number }[],
  creneauById: Map<string, CreneauRow>,
): { deplacements: Deplacement[]; changements: string[] } {
  const parId = new Map(deplacements.map((d) => [d.id, d]))
  const horaire = (creneauId: string) => {
    const c = creneauById.get(creneauId)
    return c ? `${c.heure_debut}-${c.heure_fin}` : creneauId
  }
  const salleParId = new Map(salles.map((s) => [s.id, s]))
  // Occupations (salle|jour|horaire → unités : groupe de séance ou séance) après déplacement
  const occupations = new Map<string, Set<string>>()
  const occuper = (salleId: string, jour: string, creneauId: string, unite: string) => {
    const cle = `${salleId}|${jour}|${horaire(creneauId)}`
    occupations.set(cle, (occupations.get(cle) ?? new Set<string>()).add(unite))
  }
  for (const s of seances) if (!parId.has(s.id) && s.salle_id) occuper(s.salle_id, s.jour, s.creneau_id, s.groupe_seance ?? s.id)

  const changements: string[] = []
  const resultat = deplacements.map((d) => ({ ...d }))
  const seanceParId = new Map(seances.map((s) => [s.id, s]))
  const choixParUnite = new Map<string, string | null>()
  for (const d of resultat) {
    const s = seanceParId.get(d.id)
    if (!s || !d.salleId) continue
    const unite = s.groupe_seance ?? s.id
    const cleUnite = `${unite}|${d.salleId}`
    if (choixParUnite.has(cleUnite)) {
      d.salleId = choixParUnite.get(cleUnite)!
      if (d.salleId) occuper(d.salleId, d.jour, d.creneauId, unite)
      continue
    }
    const libre = (salleId: string) => {
      const occ = occupations.get(`${salleId}|${d.jour}|${horaire(d.creneauId)}`)
      return !occ || occ.has(unite) || occ.size < (salleParId.get(salleId)?.capacite ?? 1)
    }
    const origine = salleParId.get(d.salleId)
    let choisie: string | null = d.salleId
    if (!libre(d.salleId)) {
      const autre = salles
        .filter((x) => x.type === origine?.type && x.id !== d.salleId)
        .sort((a, b) => a.nom.localeCompare(b.nom, 'fr', { numeric: true }))
        .find((x) => libre(x.id))
      choisie = autre?.id ?? null
      changements.push(
        `${classeLabel(s.niveau, s.section)} ${s.matiere} : ${origine?.nom ?? 'salle'} occupée au nouvel horaire → ${autre ? autre.nom : 'sans salle'}.`,
      )
    }
    choixParUnite.set(cleUnite, choisie)
    d.salleId = choisie
    if (choisie) occuper(choisie, d.jour, d.creneauId, unite)
  }
  return { deplacements: resultat, changements: [...new Set(changements)] }
}
