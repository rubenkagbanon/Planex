import type { Cycle } from '@/lib/cycle'
import type { ReglesPedagogiques } from '@/lib/regles'
import { analyserEntorses, type Entorse } from '@/lib/scheduling/entorses'
import { normalizeProfesseurNom } from '@/lib/scheduling/solver'
import type { Slot } from '@/lib/scheduling/slots'

// Comparaison de deux emplois du temps (ex. l'emploi du temps réel fait à la main et celui généré par
// Planex) sur des critères objectifs : volumes, services, conflits, règles pédagogiques.

export interface SeanceComparable {
  cycle: Cycle
  niveau: string
  section: number
  matiere: string
  professeur: string
  jour: string
  heureDebut: string
  creneauId: string
  salle: string | null
  // Lignes d'une même séance partagée (tandem / tronc commun) — null pour une séance simple
  groupe: string | null
}

export interface Conflit {
  type: 'professeur' | 'classe' | 'salle'
  detail: string
}

export interface Mesures {
  heuresClasse: number
  nbClasses: number
  volumes: Map<string, number> // "niveau-section|matière" → heures
  services: Map<string, number> // professeur → heures
  decoupages: Map<string, string> // "niveau-section|matière" → séances de la semaine, ex. "2+1+1"
  conflits: Conflit[]
  entorses: Entorse[]
}

const JOURS: Record<string, string> = { lundi: 'Lundi', mardi: 'Mardi', mercredi: 'Mercredi', jeudi: 'Jeudi', vendredi: 'Vendredi', samedi: 'Samedi' }

export function mesurer(
  seances: SeanceComparable[],
  slotsByJourByCycle: Record<Cycle, Map<string, Slot[]>>,
  reglesByCycle: Record<Cycle, ReglesPedagogiques>,
  capaciteSalle: (nom: string) => number = () => 1,
): Mesures {
  const classeCle = (s: SeanceComparable) => `${s.niveau}-${s.section}`
  const moment = (s: SeanceComparable) => `${s.jour}|${s.heureDebut}`

  const volumes = new Map<string, Set<string>>()
  const services = new Map<string, Set<string>>()
  for (const s of seances) {
    const v = `${classeCle(s)}|${s.matiere}`
    volumes.set(v, (volumes.get(v) ?? new Set()).add(moment(s)))
    const p = normalizeProfesseurNom(s.professeur)
    services.set(p, (services.get(p) ?? new Set()).add(moment(s)))
  }

  const conflits: Conflit[] = []
  const unite = (s: SeanceComparable, i: number) => s.groupe ?? `seule-${i}`
  const regrouper = (cle: (s: SeanceComparable) => string | null) => {
    const m = new Map<string, { s: SeanceComparable; u: string }[]>()
    seances.forEach((s, i) => {
      const k = cle(s)
      if (k) m.set(k, [...(m.get(k) ?? []), { s, u: unite(s, i) }])
    })
    return m
  }
  const quand = (s: SeanceComparable) => `${JOURS[s.jour] ?? s.jour} ${s.heureDebut.slice(0, 5)}`
  for (const liste of regrouper((s) => `${normalizeProfesseurNom(s.professeur)}|${moment(s)}`).values()) {
    if (new Set(liste.map((x) => x.u)).size > 1) {
      const s = liste[0].s
      conflits.push({ type: 'professeur', detail: `${s.professeur} — ${quand(s)} : ${liste.map((x) => `${x.s.niveau}-${x.s.section} ${x.s.matiere}`).join(' / ')}` })
    }
  }
  for (const liste of regrouper((s) => `${classeCle(s)}|${moment(s)}`).values()) {
    if (new Set(liste.map((x) => x.u)).size > 1) {
      const s = liste[0].s
      conflits.push({ type: 'classe', detail: `${classeCle(s)} — ${quand(s)} : ${liste.map((x) => x.s.matiere).join(' / ')}` })
    }
  }
  for (const [cle, liste] of regrouper((s) => (s.salle ? `${s.salle}|${moment(s)}` : null))) {
    const occupations = new Set(liste.map((x) => x.u)).size
    if (occupations > capaciteSalle(cle.split('|')[0])) {
      const s = liste[0].s
      conflits.push({ type: 'salle', detail: `${s.salle} — ${quand(s)} : ${[...new Set(liste.map((x) => `${x.s.niveau}-${x.s.section}`))].join(' / ')}` })
    }
  }

  const entorses = analyserEntorses(
    seances.map((s) => ({ niveau: s.niveau, section: s.section, matiere: s.matiere, cycle: s.cycle, jour: s.jour, creneauId: s.creneauId })),
    slotsByJourByCycle,
    reglesByCycle,
  )

  // Découpage : séquences de créneaux consécutifs d'une même matière, par classe et par jour
  const casesParCle = new Map<string, Set<number>>()
  for (const s of seances) {
    const index = slotsByJourByCycle[s.cycle]?.get(s.jour)?.findIndex((slot) => slot.heureDebut === s.heureDebut) ?? -1
    if (index < 0) continue
    const cle = `${classeCle(s)}|${s.matiere}`
    casesParCle.set(`${cle}|${s.jour}`, (casesParCle.get(`${cle}|${s.jour}`) ?? new Set<number>()).add(index))
  }
  const blocsParCle = new Map<string, number[]>()
  for (const [cleJour, cases] of casesParCle) {
    const cle = cleJour.slice(0, cleJour.lastIndexOf('|'))
    const tries = [...cases].sort((a, b) => a - b)
    const blocs = blocsParCle.get(cle) ?? []
    tries.forEach((index, i) => (i > 0 && tries[i - 1] === index - 1 ? (blocs[blocs.length - 1] += 1) : blocs.push(1)))
    blocsParCle.set(cle, blocs)
  }
  const decoupages = new Map([...blocsParCle].map(([cle, blocs]) => [cle, blocs.sort((a, b) => b - a).join('+')]))

  return {
    heuresClasse: new Set(seances.map((s) => `${classeCle(s)}|${moment(s)}`)).size,
    nbClasses: new Set(seances.map(classeCle)).size,
    volumes: new Map([...volumes].map(([k, v]) => [k, v.size])),
    services: new Map([...services].map(([k, v]) => [k, v.size])),
    decoupages,
    conflits,
    entorses,
  }
}

export interface Ecart {
  cle: string
  a: number
  b: number
}

export function ecarts(a: Map<string, number>, b: Map<string, number>): { identiques: number; total: number; differences: Ecart[] } {
  const cles = new Set([...a.keys(), ...b.keys()])
  const differences: Ecart[] = []
  for (const cle of cles) {
    const va = a.get(cle) ?? 0
    const vb = b.get(cle) ?? 0
    if (va !== vb) differences.push({ cle, a: va, b: vb })
  }
  return { identiques: cles.size - differences.length, total: cles.size, differences: differences.sort((x, y) => x.cle.localeCompare(y.cle)) }
}

// Part des séances (classe, jour, heure, matière) placées exactement au même endroit dans les deux.
export function placementsIdentiques(a: SeanceComparable[], b: SeanceComparable[]): number {
  const cle = (s: SeanceComparable) => `${s.niveau}-${s.section}|${s.jour}|${s.heureDebut}|${s.matiere}`
  const ensembleB = new Set(b.map(cle))
  const ensembleA = new Set(a.map(cle))
  if (ensembleA.size === 0) return 0
  return [...ensembleA].filter((k) => ensembleB.has(k)).length / ensembleA.size
}

// Version importée d'un emploi du temps fait à la main (PDF de l'établissement), par opposition aux versions
// que Planex enregistre lui-même (sauvegardes avant génération ou restauration, enregistrements manuels).
export function estFaitMain(label: string): boolean {
  return /r[ée]el|import[ée]e? des pdf|fait à la main/i.test(label)
}
