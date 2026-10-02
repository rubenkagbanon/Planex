import { NIVEAUX_ETABLISSEMENT } from '@/lib/horairesReference'
import { formatClasseCode, parseClasseCode } from '@/lib/classeCode'
import type { Cycle } from '@/lib/cycle'
import type { ReglesPedagogiques } from '@/lib/regles'
import type { Charge } from './charges'

// Une activité est ce que le solveur place réellement : un ensemble de séances qui ont lieu EN MÊME
// TEMPS, aux mêmes créneaux.
// - simple : une classe, un professeur (le cas général, une charge = une activité).
// - tandem : une classe scindée en groupes, un professeur (et une salle) par groupe, en parallèle — ex.
//   LV2 Allemand / Espagnol, ou S.V.T. / Physique-Chimie. La classe n'est occupée qu'une fois.
// - tronc_commun : plusieurs classes réunies pour le même cours (un professeur, une salle).
export interface GroupeActivite {
  professeurId: string
  professeurNom: string
  matiere: string
}

export interface Activite {
  id: string
  type: 'simple' | 'tandem' | 'tronc_commun'
  cycle: Cycle
  classes: { niveau: string; section: number }[]
  groupes: GroupeActivite[]
  blocks: number[]
  requiredPeriods: number
  autoConsecutiveSplittable: boolean
  // Règle "EPS aux bords" applicable (placement uniquement aux 2 premiers / 2 derniers créneaux)
  bordsDeJournee: boolean
}

export interface RegroupementInput {
  id: string
  type: 'tronc_commun' | 'tandem'
  libelle: string | null
  matieres: string[]
  classes: string[]
}

export interface BuildActivitesInput {
  charges: Charge[]
  regroupements: RegroupementInput[]
  reglesByCycle: Record<Cycle, ReglesPedagogiques>
}

function niveauLabel(niveauKey: string): string {
  return NIVEAUX_ETABLISSEMENT.find((n) => n.key === niveauKey)?.label ?? niveauKey
}

const classeKey = (niveau: string, section: number) => `${niveau}-${section}`

// Retire `quantite` séances d'une liste de blocs, en entamant d'abord les plus petits blocs (une séance
// verrouillée ou déjà placée par un autre biais "consomme" une partie du besoin).
export function soustraireSeances(blocks: number[], quantite: number): number[] {
  let reste = quantite
  const result = [...blocks].sort((a, b) => a - b)
  for (let i = 0; i < result.length && reste > 0; i++) {
    const retire = Math.min(result[i], reste)
    result[i] -= retire
    reste -= retire
  }
  return result.filter((b) => b > 0)
}

function toActivite(charge: Charge, bordsDeJournee: boolean): Activite {
  return {
    id: `simple|${charge.professeurId}|${charge.niveau}|${charge.section}`,
    type: 'simple',
    cycle: charge.cycle,
    classes: [{ niveau: charge.niveau, section: charge.section }],
    groupes: [{ professeurId: charge.professeurId, professeurNom: charge.professeurNom, matiere: charge.matiere }],
    blocks: [...charge.blocks],
    requiredPeriods: charge.requiredPeriods,
    autoConsecutiveSplittable: charge.autoConsecutiveSplittable,
    bordsDeJournee,
  }
}

export function buildActivites(input: BuildActivitesInput): { activites: Activite[]; warnings: string[] } {
  const { regroupements, reglesByCycle } = input
  const warnings: string[] = []

  // Règle "EPS aux bords" : une séance unique de `duree` créneaux par classe, quelle que soit la grille.
  let charges = input.charges.map((charge) => {
    const eps = reglesByCycle[charge.cycle]?.epsAuxBords
    if (eps?.actif && charge.matiere === eps.matiere) {
      const duree = Math.max(1, eps.duree)
      return { ...charge, blocks: [duree], requiredPeriods: duree, autoConsecutiveSplittable: false }
    }
    return charge
  })

  const estBords = (charge: Pick<Charge, 'cycle' | 'matiere'>) => {
    const eps = reglesByCycle[charge.cycle]?.epsAuxBords
    return !!eps?.actif && charge.matiere === eps.matiere
  }

  const activites: Activite[] = []
  const consommees = new Set<Charge>()

  // 1. Troncs communs déclarés : les classes listées qui ont le MÊME professeur pour cette matière sont
  //    réunies en une seule activité.
  for (const regroupement of regroupements.filter((r) => r.type === 'tronc_commun')) {
    const matiere = regroupement.matieres[0]
    const classesVoulues = new Set(regroupement.classes)
    const concernees = charges.filter(
      (c) => !consommees.has(c) && c.matiere === matiere && classesVoulues.has(classeKey(c.niveau, c.section)),
    )
    const parProfesseur = new Map<string, Charge[]>()
    for (const charge of concernees) {
      parProfesseur.set(charge.professeurNom, [...(parProfesseur.get(charge.professeurNom) ?? []), charge])
    }
    const nom = regroupement.libelle || `Tronc commun ${matiere}`
    for (const [professeurNom, groupe] of parProfesseur) {
      const cycles = new Set(groupe.map((c) => c.cycle))
      if (groupe.length < 2) continue
      if (cycles.size > 1) {
        warnings.push(`${nom} : les classes de ${professeurNom} sont à la fois au collège et au lycée — regroupement ignoré.`)
        continue
      }
      const reference = groupe.reduce((a, b) => (b.requiredPeriods > a.requiredPeriods ? b : a))
      if (groupe.some((c) => c.requiredPeriods !== reference.requiredPeriods)) {
        warnings.push(
          `${nom} : les classes n'ont pas le même volume en ${matiere} — le volume le plus élevé (${reference.requiredPeriods} séances) est retenu pour le groupe.`,
        )
      }
      for (const charge of groupe) consommees.add(charge)
      activites.push({
        id: `tronc|${regroupement.id}|${reference.professeurId}`,
        type: 'tronc_commun',
        cycle: reference.cycle,
        classes: groupe.map((c) => ({ niveau: c.niveau, section: c.section })),
        groupes: [{ professeurId: reference.professeurId, professeurNom, matiere }],
        blocks: [...reference.blocks],
        requiredPeriods: reference.requiredPeriods,
        autoConsecutiveSplittable: reference.autoConsecutiveSplittable,
        bordsDeJournee: estBords(reference),
      })
    }
    const restantes = regroupement.classes.filter(
      (code) => !activites.some((a) => a.id.startsWith(`tronc|${regroupement.id}|`) && a.classes.some((c) => classeKey(c.niveau, c.section) === code)),
    )
    if (restantes.length > 0 && restantes.length < regroupement.classes.length) {
      warnings.push(
        `${nom} : ${restantes.map(formatClasseCode).join(', ')} n'ont pas le même professeur que le reste du groupe — cours séparés.`,
      )
    }
  }

  // 2. Tandems déclarés : pour chaque classe listée, les matières du tandem sont enseignées en parallèle
  //    (un groupe par matière). Le volume commun est le plus petit des volumes ; le reste éventuel de la
  //    matière la plus lourde est placé normalement, toute la classe ensemble.
  for (const regroupement of regroupements.filter((r) => r.type === 'tandem')) {
    const nom = regroupement.libelle || `Tandem ${regroupement.matieres.join(' / ')}`
    for (const code of regroupement.classes) {
      const { niveau, section } = parseClasseCode(code)
      if (section === undefined) continue
      const parMatiere = regroupement.matieres.map((matiere) =>
        charges.find((c) => !consommees.has(c) && c.niveau === niveau && c.section === section && c.matiere === matiere),
      )
      if (parMatiere.some((c) => !c)) {
        warnings.push(`${nom} : ${formatClasseCode(code)} n'a pas de professeur pour chacune des matières — tandem ignoré pour cette classe.`)
        continue
      }
      const membres = parMatiere as Charge[]
      const reference = membres.reduce((a, b) => (b.requiredPeriods < a.requiredPeriods ? b : a))
      for (const charge of membres) consommees.add(charge)
      activites.push({
        id: `tandem|${regroupement.id}|${code}`,
        type: 'tandem',
        cycle: reference.cycle,
        classes: [{ niveau, section }],
        groupes: membres.map((c) => ({ professeurId: c.professeurId, professeurNom: c.professeurNom, matiere: c.matiere })),
        blocks: [...reference.blocks],
        requiredPeriods: reference.requiredPeriods,
        autoConsecutiveSplittable: false,
        bordsDeJournee: membres.some(estBords),
      })
      for (const charge of membres) {
        const reste = soustraireSeances(charge.blocks, reference.requiredPeriods)
        if (reste.length > 0) {
          const restant = { ...charge, blocks: reste, requiredPeriods: reste.reduce((s, b) => s + b, 0) }
          charges = [...charges, restant]
        }
      }
    }
  }

  // 3. Tandems automatiques : plusieurs professeurs pour la même matière dans une même classe.
  const parClasseMatiere = new Map<string, Charge[]>()
  for (const charge of charges) {
    if (consommees.has(charge)) continue
    const key = `${charge.niveau}|${charge.section}|${charge.matiere}`
    parClasseMatiere.set(key, [...(parClasseMatiere.get(key) ?? []), charge])
  }
  const tandemsAutoParMatiere = new Map<string, string[]>()
  for (const groupe of parClasseMatiere.values()) {
    const professeurs = new Set(groupe.map((c) => c.professeurNom))
    const tandemActif = reglesByCycle[groupe[0].cycle]?.tandemsAutomatiques.actif ?? true
    if (groupe.length < 2 || professeurs.size < 2 || !tandemActif) {
      for (const charge of groupe) {
        consommees.add(charge)
        activites.push(toActivite(charge, estBords(charge)))
      }
      continue
    }
    const reference = groupe[0]
    for (const charge of groupe) consommees.add(charge)
    tandemsAutoParMatiere.set(reference.matiere, [
      ...(tandemsAutoParMatiere.get(reference.matiere) ?? []),
      `${niveauLabel(reference.niveau)} ${reference.section} (${[...professeurs].join(' / ')})`,
    ])
    activites.push({
      id: `tandem-auto|${reference.niveau}|${reference.section}|${reference.matiere}`,
      type: 'tandem',
      cycle: reference.cycle,
      classes: [{ niveau: reference.niveau, section: reference.section }],
      groupes: groupe.map((c) => ({ professeurId: c.professeurId, professeurNom: c.professeurNom, matiere: c.matiere })),
      blocks: [...reference.blocks],
      requiredPeriods: reference.requiredPeriods,
      autoConsecutiveSplittable: reference.autoConsecutiveSplittable,
      bordsDeJournee: estBords(reference),
    })
  }

  // Un tandem automatique est attendu pour la LV2 (groupes Allemand / Espagnol), mais ailleurs il trahit
  // souvent une fiche en double (même professeur saisi avec les mêmes classes sur deux matières) : on les
  // liste pour que le censeur vérifie.
  for (const [matiere, classes] of tandemsAutoParMatiere) {
    const apercu = classes.slice(0, 6).join(', ')
    warnings.push(
      `Groupes en parallèle automatiques en ${matiere} pour ${classes.length} classe${classes.length > 1 ? 's' : ''} : ${apercu}${classes.length > 6 ? '…' : ''} — vérifie qu'il s'agit bien de groupes (ex. Allemand / Espagnol) et pas d'un professeur en double sur cette matière (Paramètres › Professeurs).`,
    )
  }

  return { activites, warnings }
}

export function activiteLabel(activite: Activite): string {
  const classes = activite.classes.map((c) => `${niveauLabel(c.niveau)} ${c.section}`).join(' + ')
  const groupes = activite.groupes.map((g) => `${g.professeurNom} (${g.matiere})`).join(' / ')
  return `${groupes} — ${classes}`
}
