import type { Cycle } from '@/lib/cycle'
import type { ReglesPedagogiques } from '@/lib/regles'
import { analyserEntorses } from '@/lib/scheduling/entorses'
import { seSuivent, type Slot } from '@/lib/scheduling/slots'
import type { SeanceComparable } from '@/lib/comparaison'

// Apprentissage d'un modèle d'établissement à partir d'un emploi du temps existant (ex. les emplois du
// temps réels de Bingerville importés des PDF) : on mesure comment les matières y sont disposées et on en
// déduit des réglages des règles pédagogiques, que le censeur applique (ou non) un par un.

export interface ObservationDecoupage {
  heures: number
  decoupage: string // ex. "2+1+1"
  nb: number // nombre de classes qui ont ce découpage
}

// Découpage observé d'une matière (informatif : le découpage à appliquer se saisit dans la grille horaire,
// ex. « 2+1+1 »)
export interface LigneDecoupage {
  matiere: string
  nbClasses: number
  observations: ObservationDecoupage[]
}

export interface Constat {
  key: keyof ReglesPedagogiques
  observe: string
  // Réglage suggéré pour cette règle (remplace la configuration actuelle si le censeur l'applique)
  suggestion: ReglesPedagogiques[keyof ReglesPedagogiques]
  // La suggestion diffère du réglage actuel
  changement: boolean
  // Pré-cochée : suggestion qui rapproche Planex du modèle sans assouplir une règle
  recommandee: boolean
}

export interface ModeleCycle {
  cycle: Cycle
  nbClasses: number
  nbSeances: number
  decoupage: LigneDecoupage[]
  constats: Constat[]
  // Autres observations (non réglables par une règle) : mercredi après-midi, etc.
  remarques: string[]
}

const pct = (x: number) => `${Math.round(x * 100)} %`

function decoupageTexte(blocs: number[]): string {
  return [...blocs].sort((a, b) => b - a).join('+')
}

export function apprendreModele(
  seances: SeanceComparable[],
  slotsByJourByCycle: Record<Cycle, Map<string, Slot[]>>,
  reglesActuelles: Record<Cycle, ReglesPedagogiques>,
): Record<Cycle, ModeleCycle | null> {
  const result = {} as Record<Cycle, ModeleCycle | null>
  for (const cycle of ['college', 'lycee'] as Cycle[]) {
    const duCycle = seances.filter((s) => s.cycle === cycle)
    result[cycle] = duCycle.length === 0 ? null : apprendreCycle(cycle, duCycle, slotsByJourByCycle, reglesActuelles[cycle])
  }
  return result
}

function apprendreCycle(
  cycle: Cycle,
  seances: SeanceComparable[],
  slotsByJourByCycle: Record<Cycle, Map<string, Slot[]>>,
  actuelles: ReglesPedagogiques,
): ModeleCycle {
  const slotsParJour = slotsByJourByCycle[cycle] ?? new Map<string, Slot[]>()
  const indexOf = (s: SeanceComparable) => slotsParJour.get(s.jour)?.findIndex((slot) => slot.heureDebut === s.heureDebut) ?? -1

  // Grille de chaque classe : jour → index de créneau → matières (plusieurs en cas de tandem)
  const grilles = new Map<string, Map<string, Map<number, Set<string>>>>()
  for (const s of seances) {
    const index = indexOf(s)
    if (index < 0) continue
    const classe = `${s.niveau}-${s.section}`
    const parJour = grilles.get(classe) ?? new Map<string, Map<number, Set<string>>>()
    const cases = parJour.get(s.jour) ?? new Map<number, Set<string>>()
    cases.set(index, (cases.get(index) ?? new Set<string>()).add(s.matiere))
    parJour.set(s.jour, cases)
    grilles.set(classe, parJour)
  }
  const nbClasseJours = [...grilles.values()].reduce((n, parJour) => n + parJour.size, 0)

  // --- Découpage : blocs de créneaux consécutifs d'une même matière, par classe, sur la semaine
  const blocsParClasseMatiere = new Map<string, { matiere: string; blocs: number[] }>()
  const sequences: { matiere: string; debut: number; fin: number; jour: string }[] = []
  for (const [classe, parJour] of grilles) {
    for (const [jour, cases] of parJour) {
      const indexes = [...cases.keys()].sort((a, b) => a - b)
      const ouvertes: { matiere: string; debut: number; fin: number; jour: string }[] = []
      for (const index of indexes) {
        for (const matiere of cases.get(index)!) {
          const enCours = ouvertes.find((seq) => seq.matiere === matiere && seq.fin === index - 1)
          if (enCours) enCours.fin = index
          else ouvertes.push({ matiere, debut: index, fin: index, jour })
        }
      }
      for (const seq of ouvertes) {
        const cle = `${classe}|${seq.matiere}`
        const entry = blocsParClasseMatiere.get(cle) ?? { matiere: seq.matiere, blocs: [] }
        entry.blocs.push(seq.fin - seq.debut + 1)
        blocsParClasseMatiere.set(cle, entry)
        sequences.push(seq)
      }
    }
  }

  const observationsParMatiere = new Map<string, Map<string, ObservationDecoupage>>()
  for (const { matiere, blocs } of blocsParClasseMatiere.values()) {
    const heures = blocs.reduce((s, b) => s + b, 0)
    const decoupage = decoupageTexte(blocs)
    const parCle = observationsParMatiere.get(matiere) ?? new Map<string, ObservationDecoupage>()
    const cle = `${heures}|${decoupage}`
    const obs = parCle.get(cle) ?? { heures, decoupage, nb: 0 }
    obs.nb++
    parCle.set(cle, obs)
    observationsParMatiere.set(matiere, parCle)
  }

  const decoupage: LigneDecoupage[] = []
  for (const [matiere, parCle] of observationsParMatiere) {
    const observations = [...parCle.values()].sort((a, b) => a.heures - b.heures || b.nb - a.nb)
    const nbClasses = observations.reduce((s, o) => s + o.nb, 0)
    decoupage.push({ matiere, nbClasses, observations })
  }
  decoupage.sort((a, b) => a.matiere.localeCompare(b.matiere, 'fr'))

  // --- Règles mesurées avec les mêmes définitions que le rapport de génération : on active chaque règle
  // et on compte ses entorses dans le modèle.
  const toutActif: ReglesPedagogiques = {
    ...actuelles,
    pasEnchainerLangues: { ...actuelles.pasEnchainerLangues, actif: true },
    pasEnchainerSciences: { ...actuelles.pasEnchainerSciences, actif: true },
    eviterCoupurePause: { ...actuelles.eviterCoupurePause, actif: true },
    uneSeanceParJour: { actif: true },
    minDisciplinesParJour: { actif: true, minimum: 1 },
  }
  const entorses = analyserEntorses(
    seances.map((s) => ({ niveau: s.niveau, section: s.section, matiere: s.matiere, cycle, jour: s.jour, creneauId: s.creneauId })),
    slotsByJourByCycle,
    { college: toutActif, lycee: toutActif },
  )
  const nbEntorses = (key: keyof ReglesPedagogiques) => entorses.filter((e) => e.regle === key).length

  const constats: Constat[] = []
  const ajouter = <K extends keyof ReglesPedagogiques>(key: K, observe: string, suggestion: ReglesPedagogiques[K], assouplit: boolean) => {
    const changement = JSON.stringify(suggestion) !== JSON.stringify(actuelles[key])
    constats.push({ key, observe, suggestion, changement, recommandee: changement && !assouplit })
  }

  // Enchaînements : taux observé comparé au taux attendu si les matières étaient disposées au hasard
  const heuresParMatiere = new Map<string, number>()
  for (const parJour of grilles.values()) for (const cases of parJour.values()) for (const m of cases.values()) for (const x of m) heuresParMatiere.set(x, (heuresParMatiere.get(x) ?? 0) + 1)
  const totalHeures = [...heuresParMatiere.values()].reduce((s, n) => s + n, 0) || 1
  let pairesContigues = 0
  for (const parJour of grilles.values()) {
    for (const [jour, cases] of parJour) {
      const daySlots = slotsParJour.get(jour) ?? []
      for (let i = 0; i + 1 < daySlots.length; i++) {
        const a = cases.get(i)
        const b = cases.get(i + 1)
        if (a && b && seSuivent(daySlots[i], daySlots[i + 1]) && [...a].join() !== [...b].join()) pairesContigues++
      }
    }
  }
  for (const key of ['pasEnchainerLangues', 'pasEnchainerSciences'] as const) {
    const groupe = actuelles[key].matieres
    const parts = groupe.map((m) => (heuresParMatiere.get(m) ?? 0) / totalHeures)
    let attendu = 0
    parts.forEach((p, i) => parts.forEach((q, j) => i !== j && (attendu += p * q)))
    const observe = pairesContigues ? nbEntorses(key) / pairesContigues : 0
    const evite = attendu > 0 && observe < attendu * 0.6
    ajouter(
      key,
      `${nbEntorses(key)} enchaînements sur ${pairesContigues} (${pct(observe)}) — au hasard on en attendrait ${pct(attendu)} : ${evite ? 'le modèle les évite' : 'le modèle ne les évite pas'}.`,
      { ...actuelles[key], actif: evite },
      !evite,
    )
  }

  // Coupure par une pause
  const multi = sequences.filter((s) => s.fin > s.debut).length
  const coupees = nbEntorses('eviterCoupurePause')
  const evitePause = multi === 0 || coupees / multi < 0.1
  ajouter(
    'eviterCoupurePause',
    `${coupees} séance(s) de plusieurs heures coupée(s) par une pause sur ${multi} (${pct(multi ? coupees / multi : 0)}).`,
    { ...actuelles.eviterCoupurePause, actif: evitePause, autoriserException: actuelles.eviterCoupurePause.autoriserException || coupees > 0 },
    !evitePause,
  )

  // Une séance par jour
  const doublons = nbEntorses('uneSeanceParJour')
  const uneParJour = doublons / Math.max(1, nbClasseJours) < 0.1
  ajouter(
    'uneSeanceParJour',
    `${doublons} journée(s)-classe sur ${nbClasseJours} (${pct(doublons / Math.max(1, nbClasseJours))}) ont deux séances séparées d'une même matière.`,
    { actif: uneParJour },
    !uneParJour,
  )

  // Disciplines différentes par jour : le minimum respecté par 90 % des journées (hors demi-journées
  // banalisées, qui ne comptent que 2 ou 3 heures)
  const distinctes = [...grilles.values()].flatMap((parJour) =>
    [...parJour.values()].map((cases) => new Set([...cases.values()].flatMap((m) => [...m])).size),
  ).sort((a, b) => a - b)
  const p10 = distinctes[Math.floor(distinctes.length * 0.1)] ?? 1
  ajouter(
    'minDisciplinesParJour',
    `Journées de ${distinctes[0] ?? 0} à ${distinctes[distinctes.length - 1] ?? 0} disciplines ; 90 % en comptent au moins ${p10}.`,
    { actif: true, minimum: Math.min(8, Math.max(1, p10)) },
    p10 < actuelles.minDisciplinesParJour.minimum,
  )

  // Remarques hors règles
  const remarques: string[] = []
  const mercrediApresMidi = seances.filter((s) => s.jour === 'mercredi' && s.heureDebut >= '12:00').length
  remarques.push(
    mercrediApresMidi === 0
      ? 'Aucun cours le mercredi après-midi : à banaliser dans « Jours & créneaux ».'
      : `${mercrediApresMidi} séance(s) le mercredi après-midi.`,
  )
  const horsCreneaux = seances.filter((s) => indexOf(s) < 0).length
  if (horsCreneaux > 0) remarques.push(`${horsCreneaux} séance(s) hors des créneaux configurés n'ont pas été analysées.`)

  return { cycle, nbClasses: grilles.size, nbSeances: seances.length, decoupage, constats, remarques }
}

// Applique au réglage actuel les constats choisis par le censeur.
export function appliquerConstats(actuelles: ReglesPedagogiques, constats: Constat[]): ReglesPedagogiques {
  const next = { ...actuelles } as Record<keyof ReglesPedagogiques, unknown>
  for (const c of constats) next[c.key] = c.suggestion
  return next as ReglesPedagogiques
}

export interface SeanceModele {
  cycle: Cycle
  jour: string
  heureDebut: string
  heureFin?: string
}

const minutes = (hhmmss: string) => {
  const [h, m] = hhmmss.split(':').map(Number)
  return h * 60 + m
}
const hhmmss = (total: number) => `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}:00`

// Créneaux d'un emploi du temps modèle, reconstruits à partir de ses propres séances : l'analyse ne dépend
// donc pas des horaires configurés dans le compte (un établissement neuf n'en a encore aucun). L'heure de
// fin vient des séances quand elle est connue ; sinon c'est la durée de séance la plus courante (le plus
// petit écart entre deux débuts), ce qui suffit à repérer les pauses (récréation, déjeuner).
export function creneauxDuModele(seances: SeanceModele[]): {
  slotsByJourByCycle: Record<Cycle, Map<string, Slot[]>>
  creneauId: (cycle: Cycle, heureDebut: string) => string
} {
  const creneauId = (cycle: Cycle, heureDebut: string) => `${cycle}|${heureDebut}`
  const slotsByJourByCycle = { college: new Map(), lycee: new Map() } as Record<Cycle, Map<string, Slot[]>>
  for (const cycle of ['college', 'lycee'] as Cycle[]) {
    const duCycle = seances.filter((s) => s.cycle === cycle)
    if (duCycle.length === 0) continue
    const fins = new Map<string, string>()
    for (const s of duCycle) if (s.heureFin) fins.set(s.heureDebut, s.heureFin)
    const debuts = [...new Set(duCycle.map((s) => s.heureDebut))].sort()
    const ecarts = debuts.slice(1).map((d, i) => minutes(d) - minutes(debuts[i])).filter((e) => e > 0)
    const duree = ecarts.length > 0 ? Math.min(...ecarts) : 60
    // Après-midi : à partir du plus grand trou de la journée (le déjeuner, qui se termine après 11h30),
    // sinon à partir de midi
    let debutApresMidi = '12:00:00'
    let plusGrandTrou = 0
    debuts.slice(1).forEach((d, i) => {
      const trou = minutes(d) - minutes(debuts[i])
      if (trou > plusGrandTrou && trou > duree && d >= '11:30:00') {
        plusGrandTrou = trou
        debutApresMidi = d
      }
    })
    const jours = [...new Set(duCycle.map((s) => s.jour))]
    for (const jour of jours) {
      const debutsDuJour = new Set(duCycle.filter((s) => s.jour === jour).map((s) => s.heureDebut))
      // Une journée sans aucun cours l'après-midi (mercredi) n'a pas de créneaux d'après-midi
      const apresMidiOuvert = [...debutsDuJour].some((d) => d >= debutApresMidi)
      const slots: Slot[] = debuts
        .filter((d) => apresMidiOuvert || d < debutApresMidi)
        .map((d) => ({
          jour,
          creneauId: creneauId(cycle, d),
          heureDebut: d,
          heureFin: fins.get(d) ?? hhmmss(minutes(d) + duree),
          apresMidi: d >= debutApresMidi,
        }))
      slotsByJourByCycle[cycle].set(jour, slots)
    }
  }
  return { slotsByJourByCycle, creneauId }
}

export interface CreneauPropose {
  heureDebut: string
  heureFin: string
  type: 'cours' | 'recreation' | 'dejeuner'
}

export interface HorairesModele {
  cycle: Cycle
  jours: string[]
  mercrediApresMidiBanalise: boolean
  creneaux: CreneauPropose[]
}

const ORDRE_JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']

// Horaires d'un établissement déduits de son emploi du temps : jours de cours, créneaux de cours, et entre
// eux les pauses (le plus long trou est le déjeuner, les autres des récréations). Permet de proposer au
// censeur de reprendre ces horaires dans Paramètres › Horaires & contraintes.
export function horairesDuModele(seances: SeanceModele[]): HorairesModele[] {
  const { slotsByJourByCycle } = creneauxDuModele(seances)
  const result: HorairesModele[] = []
  for (const cycle of ['college', 'lycee'] as Cycle[]) {
    const parJour = slotsByJourByCycle[cycle]
    if (parJour.size === 0) continue
    const cours = new Map<string, Slot>()
    for (const slots of parJour.values()) for (const s of slots) cours.set(s.heureDebut, s)
    const tries = [...cours.values()].sort((a, b) => a.heureDebut.localeCompare(b.heureDebut))
    const creneaux: CreneauPropose[] = []
    tries.forEach((s, i) => {
      const precedent = tries[i - 1]
      if (precedent && !seSuivent(precedent, s) && precedent.heureFin < s.heureDebut) {
        creneaux.push({ heureDebut: precedent.heureFin, heureFin: s.heureDebut, type: s.apresMidi && !precedent.apresMidi ? 'dejeuner' : 'recreation' })
      }
      creneaux.push({ heureDebut: s.heureDebut, heureFin: s.heureFin, type: 'cours' })
    })
    const jours = ORDRE_JOURS.filter((j) => parJour.has(j))
    const apresMidiAilleurs = [...parJour.entries()].some(([j, slots]) => j !== 'mercredi' && slots.some((s) => s.apresMidi))
    const mercrediApresMidiBanalise = parJour.has('mercredi') && apresMidiAilleurs && !parJour.get('mercredi')!.some((s) => s.apresMidi)
    result.push({ cycle, jours, mercrediApresMidiBanalise, creneaux })
  }
  return result
}
