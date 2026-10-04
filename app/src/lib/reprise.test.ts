/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { cycleForNiveau } from './cycle'
import { versLignesVersion, type ClassePdf, type SeancePdf } from './importEdtPdf'
import { choixParDefaut, nomNormalise, preparerReprise, simulerReprise, type EtatPlanex } from './reprise'
import { DEFAULT_HORAIRES, DISCIPLINES } from './horairesReference'

// Emplois du temps réels de Bingerville (faits à la main, ils contiennent des conflits)
const reel = JSON.parse(readFileSync(resolve(process.cwd(), '../source/emplois_du_temps_reels.json'), 'utf8')) as Record<
  string,
  { fichier: string; professeurPrincipal: string | null; heuresAnnoncees: number; seances: SeancePdf[] }
>
const classes: ClassePdf[] = Object.entries(reel).map(([code, c]) => {
  const [niveau, section] = code.split('-')
  return {
    fichier: c.fichier,
    niveau,
    section: Number(section),
    cycle: cycleForNiveau(niveau),
    professeurPrincipal: c.professeurPrincipal,
    heuresAnnoncees: c.heuresAnnoncees,
    heuresLues: c.heuresAnnoncees,
    seances: c.seances,
    anomalies: [],
  }
})
const lignes = versLignesVersion(classes)
const grid = Object.fromEntries(DISCIPLINES.map((d) => [d, { ...DEFAULT_HORAIRES[d] }]))

const HORAIRES = ['07:45', '08:35', '09:25', '10:30', '11:20', '13:15', '14:05', '14:55', '15:45']
const creneaux = (['college', 'lycee'] as const).flatMap((cycle) =>
  HORAIRES.map((h, i) => ({ id: `${cycle}-${i}`, cycle, heure_debut: `${h}:00`, heure_fin: `${h}:00`, type: 'cours' })),
)

describe('reprise d’un emploi du temps importé', () => {
  it('établissement vide : propose de créer professeurs, classes et salles, puis écarte les conflits', () => {
    const etat: EtatPlanex = { professeurs: [], nombreClasses: {}, creneaux, salles: [] }
    const bilan = preparerReprise(lignes, etat, grid)
    expect(bilan.nbSeances).toBe(961)
    expect(bilan.professeurs.every((p) => p.action.type === 'creer')).toBe(true)
    expect(bilan.classesManquantes).toHaveLength(37)
    expect(bilan.sallesManquantes.length).toBeGreaterThan(20)
    expect(bilan.horairesManquants).toEqual([])

    const sim = simulerReprise(lignes, bilan, choixParDefaut(bilan), etat)
    expect(sim.reprises.length + sim.misesDeCote.length).toBe(961)
    expect(sim.misesDeCote.length).toBeGreaterThan(0)
    expect(sim.misesDeCote.every((m) => /conflit/.test(m.raison))).toBe(true)

    // Les séances reprises ne contiennent plus aucun conflit de professeur ni de classe
    const unite = (l: (typeof lignes)[number]) => l.groupe_seance ?? `${l.niveau}-${l.section}|${l.matiere}|${l.professeur_nom}`
    const prof = new Map<string, Set<string>>()
    const classe = new Map<string, Set<string>>()
    for (const l of sim.reprises) {
      const t = `${l.jour}|${l.heure_debut}`
      const kp = `${nomNormalise(l.professeur_nom)}|${t}`
      const kc = `${l.niveau}-${l.section}|${t}`
      prof.set(kp, (prof.get(kp) ?? new Set()).add(unite(l)))
      classe.set(kc, (classe.get(kc) ?? new Set()).add(unite(l)))
    }
    expect([...prof.values()].every((s) => s.size === 1)).toBe(true)
    expect([...classe.values()].every((s) => s.size === 1)).toBe(true)
  })

  it('rapproche les fiches existantes et laisse le choix au censeur', () => {
    const etat: EtatPlanex = {
      professeurs: [
        { id: 'p1', nom_complet: 'Bah G. E.', matiere: 'E.P.S.', niveaux: [] },
        { id: 'p2', nom_complet: 'M. BLOMMIN Jean-Luc', matiere: 'Anglais', niveaux: [] },
      ],
      nombreClasses: { '3e': 7 },
      creneaux,
      salles: [],
    }
    const bilan = preparerReprise(lignes, etat, grid)
    const bah = bilan.professeurs.find((p) => p.nom === 'Bah G. E.' && p.matiere === 'E.P.S.')!
    expect(bah.action).toEqual({ type: 'existante', ficheId: 'p1' })
    const blommin = bilan.professeurs.find((p) => p.nom.startsWith('Blommin'))!
    expect(blommin.action).toEqual({ type: 'associer', ficheId: 'p2' })
    expect(bilan.classesManquantes.some((c) => c.code.startsWith('3e-'))).toBe(false)

    // Professeur non repris : ses séances sont mises de côté avec la raison
    const choix = choixParDefaut(bilan)
    choix.professeurs[bah.cle] = { type: 'ignorer' }
    const sim = simulerReprise(lignes, bilan, choix, etat)
    expect(sim.misesDeCote.filter((m) => m.ligne.professeur_nom === 'Bah G. E.').every((m) => /non repris/.test(m.raison))).toBe(true)
  })

  it('signale les horaires absents et les écarts de volume', () => {
    const etat: EtatPlanex = { professeurs: [], nombreClasses: {}, creneaux: creneaux.filter((c) => !c.heure_debut.startsWith('15:45')), salles: [] }
    const bilan = preparerReprise(lignes, etat, grid)
    expect(bilan.horairesManquants.map((h) => h.heureDebut.slice(0, 5))).toContain('15:45')
    const choix = { ...choixParDefaut(bilan), creerCreneaux: false }
    const sim = simulerReprise(lignes, bilan, choix, etat)
    expect(sim.misesDeCote.some((m) => /horaire 15h45 absent/.test(m.raison))).toBe(true)
    expect(bilan.ecartsVolume.length).toBeGreaterThan(0)
  })
})
