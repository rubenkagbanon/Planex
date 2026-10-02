/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { apprendreModele, appliquerConstats, creneauxDuModele, horairesDuModele } from './apprentissage'
import type { SeanceComparable } from './comparaison'
import type { Cycle } from './cycle'
import { REGLES_DEFAUT } from './regles'
import { groupSlotsByJour } from './scheduling/entorses'
import type { Slot } from './scheduling/slots'

// Emplois du temps réels du Collège Le Conquérant de Bingerville (extraits des PDF par
// scripts/extraire-edt-pdf.mjs) : le modèle appris doit retrouver la façon dont l'établissement dispose
// ses matières.
interface SeanceReelle {
  jour: string
  debut: string
  fin: string
  matiere: string
  professeur: string | null
  salle: string | null
}
const reel = JSON.parse(readFileSync(resolve(process.cwd(), '../source/emplois_du_temps_reels.json'), 'utf8')) as Record<
  string,
  { seances: SeanceReelle[] }
>

const HORAIRES: [string, string][] = [
  ['07:45:00', '08:35:00'],
  ['08:35:00', '09:25:00'],
  ['09:25:00', '10:15:00'],
  ['10:30:00', '11:20:00'],
  ['11:20:00', '12:10:00'],
  ['13:15:00', '14:05:00'],
  ['14:05:00', '14:55:00'],
  ['14:55:00', '15:45:00'],
  ['15:45:00', '16:35:00'],
]
const JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi']
const cycleDe = (niveau: string): Cycle => (/^(6e|5e|4e|3e)$/.test(niveau) ? 'college' : 'lycee')

function slots(cycle: Cycle): Slot[] {
  return JOURS.flatMap((jour) =>
    HORAIRES.map(([heureDebut, heureFin], i) => ({ jour, creneauId: `${cycle}-${i}`, heureDebut, heureFin, apresMidi: i >= 5 })).filter(
      (s) => !(jour === 'mercredi' && s.apresMidi),
    ),
  )
}
const slotsByJourByCycle = { college: groupSlotsByJour(slots('college')), lycee: groupSlotsByJour(slots('lycee')) }

const seances: SeanceComparable[] = Object.entries(reel).flatMap(([classe, { seances }]) => {
  const [niveau, section] = classe.split('-')
  const cycle = cycleDe(niveau)
  return seances.map((s) => ({
    cycle,
    niveau,
    section: Number(section),
    matiere: s.matiere,
    professeur: s.professeur ?? '?',
    jour: s.jour,
    heureDebut: s.debut,
    creneauId: `${cycle}-${HORAIRES.findIndex(([d]) => d === s.debut)}`,
    salle: s.salle,
    groupe: null,
  }))
})

describe('apprentissage du modèle de Bingerville', () => {
  const modele = apprendreModele(seances, slotsByJourByCycle, { college: REGLES_DEFAUT, lycee: REGLES_DEFAUT })
  const observe = (cycle: Cycle, matiere: string) => modele[cycle]!.decoupage.find((l) => l.matiere === matiere)?.observations.map((o) => `${o.heures}h:${o.decoupage}`)
  const constat = (cycle: Cycle, key: string) => modele[cycle]!.constats.find((c) => c.key === key)!

  it('analyse les deux cycles', () => {
    expect(modele.college!.nbClasses).toBe(22)
    expect(modele.lycee!.nbClasses).toBe(15)
  })

  it('relève comment chaque matière est découpée', () => {
    expect(observe('college', 'Anglais')).toEqual(['3h:1+1+1'])
    expect(observe('college', 'Physique-Chimie')).toEqual(['2h:2'])
    expect(observe('lycee', 'Physique-Chimie')).toContain('5h:2+2+1')
  })

  it("voit qu'au collège les sciences ne s'enchaînent pas, mais les langues si", () => {
    expect((constat('college', 'pasEnchainerSciences').suggestion as { actif: boolean }).actif).toBe(true)
    expect((constat('college', 'pasEnchainerLangues').suggestion as { actif: boolean }).actif).toBe(false)
    // assouplir une règle n'est jamais pré-coché
    expect(constat('college', 'pasEnchainerLangues').recommandee).toBe(false)
  })

  it('relève la demi-journée libre des professeurs et le mercredi après-midi sans cours', () => {
    expect((constat('college', 'demiJourneeLibreProfesseur').suggestion as { actif: boolean }).actif).toBe(true)
    expect(modele.college!.remarques[0]).toMatch(/Aucun cours le mercredi après-midi/)
  })

  it('applique seulement les constats choisis', () => {
    const choisis = modele.college!.constats.filter((c) => c.key === 'pasEnchainerSciences')
    const regles = appliquerConstats({ ...REGLES_DEFAUT, pasEnchainerSciences: { ...REGLES_DEFAUT.pasEnchainerSciences, actif: false } }, choisis)
    expect(regles.pasEnchainerSciences.actif).toBe(true)
    expect(regles.pasEnchainerLangues).toEqual(REGLES_DEFAUT.pasEnchainerLangues)
  })
})

describe('créneaux reconstruits à partir du modèle', () => {
  it("donne la même analyse qu'avec les créneaux configurés, même sans heure de fin ni horaires dans le compte", () => {
    const { slotsByJourByCycle: duModele, creneauId } = creneauxDuModele(seances.map((s) => ({ cycle: s.cycle, jour: s.jour, heureDebut: s.heureDebut })))
    const seancesModele = seances.map((s) => ({ ...s, creneauId: creneauId(s.cycle, s.heureDebut) }))
    const attendu = apprendreModele(seances, slotsByJourByCycle, { college: REGLES_DEFAUT, lycee: REGLES_DEFAUT })
    const obtenu = apprendreModele(seancesModele, duModele, { college: REGLES_DEFAUT, lycee: REGLES_DEFAUT })
    for (const cycle of ['college', 'lycee'] as Cycle[]) {
      expect(obtenu[cycle]!.nbSeances).toBe(attendu[cycle]!.nbSeances)
      expect(obtenu[cycle]!.decoupage).toEqual(attendu[cycle]!.decoupage)
      expect(obtenu[cycle]!.constats.map((c) => c.observe)).toEqual(attendu[cycle]!.constats.map((c) => c.observe))
    }
    // récréation après 09:25 (fin 10:15, reprise 10:30) et mercredi après-midi sans créneau
    expect(duModele.college.get('lundi')!.find((x) => x.heureDebut === '09:25:00')!.heureFin).toBe('10:15:00')
    expect(duModele.college.get('mercredi')!.some((x) => x.apresMidi)).toBe(false)
  })
})

describe('horaires proposés à partir du modèle', () => {
  it('retrouve la journée de Bingerville avec sa récréation et son déjeuner', () => {
    const [college] = horairesDuModele(seances.filter((s) => s.cycle === 'college').map((s) => ({ cycle: s.cycle, jour: s.jour, heureDebut: s.heureDebut })))
    expect(college.jours).toEqual(['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi'])
    expect(college.mercrediApresMidiBanalise).toBe(true)
    expect(college.creneaux.map((c) => `${c.heureDebut.slice(0, 5)}-${c.heureFin.slice(0, 5)} ${c.type}`)).toEqual([
      '07:45-08:35 cours',
      '08:35-09:25 cours',
      '09:25-10:15 cours',
      '10:15-10:30 recreation',
      '10:30-11:20 cours',
      '11:20-12:10 cours',
      '12:10-13:15 dejeuner',
      '13:15-14:05 cours',
      '14:05-14:55 cours',
      '14:55-15:45 cours',
      '15:45-16:35 cours',
    ])
  })
})
