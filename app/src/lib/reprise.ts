import type { Cycle } from '@/lib/cycle'
import { NIVEAUX_ETABLISSEMENT, minutesForNiveauEtablissement } from '@/lib/horairesReference'
import type { LigneVersion } from '@/lib/importEdtPdf'

// Reprise d'un emploi du temps importé (PDF) comme emploi du temps de Planex, séance par séance.
// 1. `preparerReprise` dresse le bilan : professeurs, classes, salles et horaires du PDF absents de Planex
//    (chacun avec une action proposée, que le censeur valide), et les écarts de volume avec la grille.
// 2. `simulerReprise` décide, pour les choix faits, quelles séances seront reprises telles quelles et
//    lesquelles sont mises de côté (avec la raison) : un emploi du temps fait à la main contient souvent des
//    conflits (un professeur dans deux classes à la fois…) que la base refuserait.

export interface FichePlanex {
  id: string
  nom_complet: string
  matiere: string
  niveaux: string[]
}

export interface EtatPlanex {
  professeurs: FichePlanex[]
  // Nombre de classes par niveau ("3e" → 7)
  nombreClasses: Record<string, number>
  creneaux: { id: string; cycle: string; heure_debut: string; heure_fin: string; type: string }[]
  salles: { id: string; nom: string; capacite: number }[]
}

export type ActionProfesseur = { type: 'existante'; ficheId: string } | { type: 'associer'; ficheId: string } | { type: 'creer' } | { type: 'ignorer' }

export interface PropositionProfesseur {
  cle: string // nom|matière tels que dans le PDF
  nom: string
  matiere: string
  classes: string[] // codes "3e-2"
  nbSeances: number
  // Fiches de même matière dont le nom ressemble (associations possibles)
  candidates: FichePlanex[]
  // Fiche existante du même professeur pour une autre matière (information)
  autreMatiere: FichePlanex | null
  action: ActionProfesseur
}

export interface PropositionClasse {
  code: string // "3e-7"
  niveau: string
  section: number
  nbSeances: number
  niveauValide: boolean
}

export interface PropositionSalle {
  nom: string
  nbSeances: number
}

export interface EcartVolume {
  classe: string
  matiere: string
  pdf: number
  grille: number
}

export interface BilanReprise {
  professeurs: PropositionProfesseur[]
  classesManquantes: PropositionClasse[]
  sallesManquantes: PropositionSalle[]
  // Horaires du PDF sans créneau correspondant dans Planex, par cycle
  horairesManquants: { cycle: Cycle; heureDebut: string; nbSeances: number }[]
  ecartsVolume: EcartVolume[]
  nbSeances: number
}

export interface ChoixReprise {
  professeurs: Record<string, ActionProfesseur> // par clé de proposition
  creerClasses: boolean
  creerSalles: boolean
  // Les créneaux manquants seront créés (horaires du modèle) avant la reprise
  creerCreneaux: boolean
}

const CIVILITE = /^(M\.?|MR\.?|MME\.?|MLLE\.?|MELLE\.?|DR\.?)\s+/i
export function nomNormalise(nom: string): string {
  let s = nom.trim()
  while (CIVILITE.test(s)) s = s.replace(CIVILITE, '')
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
const mots = (nom: string) => nomNormalise(nom).split(' ').filter((m) => m.length >= 3)
const codeClasse = (l: Pick<LigneVersion, 'niveau' | 'section'>) => `${l.niveau}-${l.section}`
const heureCle = (h: string) => h.slice(0, 5)

export function preparerReprise(lignes: LigneVersion[], etat: EtatPlanex, grid: Record<string, Record<string, string>>): BilanReprise {
  // --- Professeurs : une proposition par (nom, matière) du PDF
  const parProf = new Map<string, { nom: string; matiere: string; classes: Set<string>; nb: number }>()
  for (const l of lignes) {
    if (!l.professeur_nom || l.professeur_nom === '?') continue
    const cle = `${l.professeur_nom}|${l.matiere}`
    const entree = parProf.get(cle) ?? { nom: l.professeur_nom, matiere: l.matiere, classes: new Set<string>(), nb: 0 }
    entree.classes.add(codeClasse(l))
    entree.nb++
    parProf.set(cle, entree)
  }
  const professeurs: PropositionProfesseur[] = [...parProf.entries()].map(([cle, p]) => {
    const memeMatiere = etat.professeurs.filter((f) => f.matiere === p.matiere)
    const exacte = memeMatiere.find((f) => nomNormalise(f.nom_complet) === nomNormalise(p.nom))
    const motsPdf = new Set(mots(p.nom))
    const candidates = exacte ? [exacte] : memeMatiere.filter((f) => mots(f.nom_complet).some((m) => motsPdf.has(m)))
    const autreMatiere = etat.professeurs.find((f) => f.matiere !== p.matiere && nomNormalise(f.nom_complet) === nomNormalise(p.nom)) ?? null
    const action: ActionProfesseur = exacte
      ? { type: 'existante', ficheId: exacte.id }
      : candidates.length === 1
        ? { type: 'associer', ficheId: candidates[0].id }
        : { type: 'creer' }
    return { cle, nom: p.nom, matiere: p.matiere, classes: [...p.classes].sort(), nbSeances: p.nb, candidates, autreMatiere, action }
  })
  professeurs.sort((a, b) => a.nom.localeCompare(b.nom, 'fr') || a.matiere.localeCompare(b.matiere, 'fr'))

  // --- Classes absentes de Paramètres › Classes
  const parClasse = new Map<string, PropositionClasse>()
  for (const l of lignes) {
    const code = codeClasse(l)
    const connue = (etat.nombreClasses[l.niveau] ?? 0) >= l.section
    if (connue) continue
    const p = parClasse.get(code) ?? { code, niveau: l.niveau, section: l.section, nbSeances: 0, niveauValide: NIVEAUX_ETABLISSEMENT.some((n) => n.key === l.niveau) }
    p.nbSeances++
    parClasse.set(code, p)
  }

  // --- Salles absentes
  const sallesConnues = new Set(etat.salles.map((s) => s.nom.trim().toUpperCase()))
  const parSalle = new Map<string, number>()
  for (const l of lignes) {
    if (!l.salle_nom || sallesConnues.has(l.salle_nom.trim().toUpperCase())) continue
    parSalle.set(l.salle_nom.trim(), (parSalle.get(l.salle_nom.trim()) ?? 0) + 1)
  }

  // --- Horaires sans créneau de cours correspondant
  const creneauxCours = new Set(etat.creneaux.filter((c) => c.type === 'cours').map((c) => `${c.cycle}|${heureCle(c.heure_debut)}`))
  const parHoraire = new Map<string, { cycle: Cycle; heureDebut: string; nbSeances: number }>()
  for (const l of lignes) {
    const cle = `${l.cycle}|${heureCle(l.heure_debut)}`
    if (creneauxCours.has(cle)) continue
    const p = parHoraire.get(cle) ?? { cycle: l.cycle as Cycle, heureDebut: l.heure_debut, nbSeances: 0 }
    p.nbSeances++
    parHoraire.set(cle, p)
  }

  // --- Volumes classe × matière comparés à la grille horaire de référence
  const heures = new Map<string, Set<string>>()
  for (const l of lignes) {
    const cle = `${codeClasse(l)}|${l.matiere}`
    heures.set(cle, (heures.get(cle) ?? new Set()).add(`${l.jour}|${heureCle(l.heure_debut)}`))
  }
  const ecartsVolume: EcartVolume[] = []
  for (const [cle, moments] of heures) {
    const [classe, matiere] = cle.split('|')
    const niveau = classe.slice(0, classe.lastIndexOf('-'))
    const minutes = minutesForNiveauEtablissement(grid, matiere, niveau)
    if (minutes <= 0) continue
    const grille = Math.ceil(minutes / 60)
    if (grille !== moments.size) ecartsVolume.push({ classe, matiere, pdf: moments.size, grille })
  }
  ecartsVolume.sort((a, b) => a.classe.localeCompare(b.classe, 'fr', { numeric: true }) || a.matiere.localeCompare(b.matiere, 'fr'))

  return {
    professeurs,
    classesManquantes: [...parClasse.values()].sort((a, b) => a.code.localeCompare(b.code, 'fr', { numeric: true })),
    sallesManquantes: [...parSalle.entries()].map(([nom, nbSeances]) => ({ nom, nbSeances })).sort((a, b) => a.nom.localeCompare(b.nom, 'fr', { numeric: true })),
    horairesManquants: [...parHoraire.values()].sort((a, b) => a.cycle.localeCompare(b.cycle) || a.heureDebut.localeCompare(b.heureDebut)),
    ecartsVolume,
    nbSeances: lignes.length,
  }
}

export interface SeanceMiseDeCote {
  ligne: LigneVersion
  raison: string
}

export interface SimulationReprise {
  reprises: LigneVersion[]
  misesDeCote: SeanceMiseDeCote[]
  // Séances reprises sans leur salle (salle déjà occupée à ce moment)
  sansSalle: SeanceMiseDeCote[]
}

const JOURS: Record<string, string> = { lundi: 'lundi', mardi: 'mardi', mercredi: 'mercredi', jeudi: 'jeudi', vendredi: 'vendredi', samedi: 'samedi' }
const libelleClasse = (code: string) => {
  const i = code.lastIndexOf('-')
  const niveau = code.slice(0, i)
  return `${NIVEAUX_ETABLISSEMENT.find((n) => n.key === niveau)?.label ?? niveau} ${code.slice(i + 1)}`
}

// Capacité d'une salle à créer (nombre de classes accueillies en même temps)
export function capaciteNouvelleSalle(nom: string): number {
  return /TERRAIN|PLATEAU|STADE|AMPHI/i.test(nom) ? 3 : 1
}

export function simulerReprise(lignes: LigneVersion[], bilan: BilanReprise, choix: ChoixReprise, etat: EtatPlanex): SimulationReprise {
  const ficheParId = new Map(etat.professeurs.map((f) => [f.id, f]))
  // Personne visée par chaque (nom, matière) du PDF : la fiche associée, ou le nom du PDF pour une création
  const personne = (l: LigneVersion) => {
    const action = choix.professeurs[`${l.professeur_nom}|${l.matiere}`]
    if (!action || action.type === 'ignorer') return null
    if (action.type === 'creer') return nomNormalise(l.professeur_nom)
    return nomNormalise(ficheParId.get(action.ficheId)?.nom_complet ?? l.professeur_nom)
  }
  const classesManquantes = new Map(bilan.classesManquantes.map((c) => [c.code, c]))
  const horairesManquants = new Set(bilan.horairesManquants.map((h) => `${h.cycle}|${heureCle(h.heureDebut)}`))
  const sallesManquantes = new Set(bilan.sallesManquantes.map((s) => s.nom.toUpperCase()))
  const capacite = (nom: string) =>
    etat.salles.find((s) => s.nom.trim().toUpperCase() === nom.trim().toUpperCase())?.capacite ?? capaciteNouvelleSalle(nom)

  // Séances partagées, reprises ou écartées ensemble : lignes d'un même groupe (tandem, tronc commun), et
  // lignes où la même personne enseigne la même matière au même moment (ex. groupe d'allemand réunissant les
  // élèves de deux classes, en tandem avec l'espagnol dans chacune).
  const parent = lignes.map((_, i) => i)
  const racine = (i: number): number => (parent[i] === i ? i : (parent[i] = racine(parent[i])))
  const lier = new Map<string, number>()
  lignes.forEach((l, i) => {
    const moment = `${l.jour}|${heureCle(l.heure_debut)}`
    const p = personne(l)
    for (const cle of [l.groupe_seance ? `g|${l.groupe_seance}|${moment}` : null, p ? `p|${p}|${l.matiere}|${moment}` : null]) {
      if (!cle) continue
      const j = lier.get(cle)
      if (j === undefined) lier.set(cle, i)
      else parent[racine(i)] = racine(j)
    }
  })
  const parUnite = new Map<number, LigneVersion[]>()
  lignes.forEach((l, i) => parUnite.set(racine(i), [...(parUnite.get(racine(i)) ?? []), l]))
  const unites = [...parUnite.values()]

  const occupeProf = new Map<string, LigneVersion>()
  const occupeClasse = new Map<string, LigneVersion>()
  const occupeSalle = new Map<string, number>()
  const reprises: LigneVersion[] = []
  const misesDeCote: SeanceMiseDeCote[] = []
  const sansSalle: SeanceMiseDeCote[] = []
  const decrire = (l: LigneVersion) => `${l.matiere} en ${libelleClasse(codeClasse(l))}`

  let numeroUnite = 0
  for (const unite of unites) {
    numeroUnite++
    const groupe = unite.length > 1 ? `unite-${numeroUnite}` : null
    const moment = `${unite[0].jour}|${heureCle(unite[0].heure_debut)}`
    const quand = `le ${JOURS[unite[0].jour] ?? unite[0].jour} à ${heureCle(unite[0].heure_debut).replace(':', 'h')}`
    let raison: string | null = null
    for (const l of unite) {
      const p = personne(l)
      const classe = classesManquantes.get(codeClasse(l))
      if (!l.professeur_nom || l.professeur_nom === '?') raison = 'aucun professeur indiqué dans le PDF'
      else if (p === null) raison = `professeur ${l.professeur_nom} (${l.matiere}) non repris`
      else if (classe && (!choix.creerClasses || !classe.niveauValide))
        raison = classe.niveauValide ? `classe ${libelleClasse(classe.code)} absente de Planex` : `niveau « ${l.niveau} » inconnu`
      else if (horairesManquants.has(`${l.cycle}|${heureCle(l.heure_debut)}`) && !choix.creerCreneaux)
        raison = `horaire ${heureCle(l.heure_debut).replace(':', 'h')} absent des créneaux de Planex`
      if (raison) break
    }
    if (!raison) {
      // Conflits : la même personne ou la même classe déjà prise à ce moment par une autre séance
      const personnesUnite = new Set(unite.map(personne))
      const classesUnite = new Set(unite.map(codeClasse))
      for (const p of personnesUnite) {
        const autre = occupeProf.get(`${p}|${moment}`)
        if (autre) {
          raison = `conflit : ${autre.professeur_nom} a déjà ${decrire(autre)} ${quand}`
          break
        }
      }
      if (!raison) {
        for (const c of classesUnite) {
          const autre = occupeClasse.get(`${c}|${moment}`)
          if (autre) {
            raison = `conflit : la ${libelleClasse(c)} a déjà ${autre.matiere} ${quand}`
            break
          }
        }
      }
    }
    if (raison) {
      for (const l of unite) misesDeCote.push({ ligne: l, raison })
      continue
    }

    // Salles : une occupation par séance partagée ; au-delà de la capacité, la séance est reprise sans salle
    const sallesUnite = new Map<string, LigneVersion[]>()
    for (const l of unite) {
      if (!l.salle_nom) continue
      if (sallesManquantes.has(l.salle_nom.trim().toUpperCase()) && !choix.creerSalles) continue
      const cle = l.salle_nom.trim().toUpperCase()
      sallesUnite.set(cle, [...(sallesUnite.get(cle) ?? []), l])
    }
    const retirees = new Set<LigneVersion>()
    for (const [salle, membres] of sallesUnite) {
      const cle = `${salle}|${moment}`
      if ((occupeSalle.get(cle) ?? 0) + 1 > capacite(salle)) {
        for (const l of membres) {
          retirees.add(l)
          sansSalle.push({ ligne: l, raison: `salle ${l.salle_nom} déjà occupée ${quand}` })
        }
      } else {
        occupeSalle.set(cle, (occupeSalle.get(cle) ?? 0) + 1)
      }
    }
    for (const l of unite) {
      const p = personne(l)!
      occupeProf.set(`${p}|${moment}`, l)
      occupeClasse.set(`${codeClasse(l)}|${moment}`, l)
      const sansSalleIci = retirees.has(l) || (!!l.salle_nom && sallesManquantes.has(l.salle_nom.trim().toUpperCase()) && !choix.creerSalles)
      reprises.push({ ...l, salle_nom: sansSalleIci ? null : l.salle_nom, groupe_seance: groupe })
    }
  }
  return { reprises, misesDeCote, sansSalle }
}

export function choixParDefaut(bilan: BilanReprise): ChoixReprise {
  return {
    professeurs: Object.fromEntries(bilan.professeurs.map((p) => [p.cle, p.action])),
    creerClasses: true,
    creerSalles: true,
    creerCreneaux: true,
  }
}
