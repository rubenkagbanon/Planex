import { describe, expect, it } from 'vitest'
import { anneeSuivante, archiveCommeSource, documentsArchive, grilleArchive, texteCase, type AnneeArchivee } from './bibliotheque'
import { estFaitMain } from './comparaison'
import type { LigneVersion } from './importEdtPdf'

const ligne = (p: Partial<LigneVersion>): LigneVersion => ({
  cycle: 'college',
  jour: 'lundi',
  heure_debut: '07:30:00',
  heure_fin: '08:25:00',
  niveau: '6e',
  section: 1,
  matiere: 'Français',
  professeur_nom: 'M. GUIOUNOU',
  salle_nom: 'S1',
  groupe_seance: null,
  ...p,
})

const archive = (p: Partial<AnneeArchivee>): AnneeArchivee => ({
  id: 'a1',
  etablissement_id: 'e',
  annee_scolaire: '2024-2025',
  origine: 'import',
  nb_seances: 0,
  nb_classes: 0,
  nb_professeurs: 0,
  donnees: {},
  seances: [],
  versions: [],
  created_by: null,
  created_at: '2026-10-02T10:00:00Z',
  ...p,
})

describe('bibliothèque des années', () => {
  const seances = [
    ligne({}),
    ligne({ heure_debut: '08:25:00', heure_fin: '09:20:00', matiere: 'Mathématiques', professeur_nom: 'M. VOLE BI' }),
    ligne({ heure_debut: '10:30:00', heure_fin: '11:20:00', niveau: '5e', section: 2, salle_nom: 'S9' }),
  ]

  it('propose l’année suivante', () => {
    expect(anneeSuivante('2025-2026')).toBe('2026-2027')
    expect(anneeSuivante('2025–2026')).toBe('2026-2027')
    expect(anneeSuivante('')).toBe('')
  })

  it('regroupe les séances par classe, professeur ou salle', () => {
    expect(documentsArchive(seances, 'classe').map((d) => d.titre)).toEqual(['6e 1', '5e 2'])
    expect(documentsArchive(seances, 'professeur').map((d) => d.titre)).toEqual(['M. GUIOUNOU', 'M. VOLE BI'])
    expect(documentsArchive(seances, 'salle').map((d) => d.key)).toEqual(['S1', 'S9'])
    expect(texteCase([seances[0]], 'professeur')).toBe('Français · 6e 1 · S1')
  })

  it('reconstruit la grille d’une année importée, récréation comprise', () => {
    const { lignes, jours } = grilleArchive(archive({ seances: seances as never }), ['college'])
    expect(jours).toEqual(['lundi'])
    expect(lignes.map((l) => `${l.heureDebut.slice(0, 5)} ${l.type}`)).toEqual(['07:30 cours', '08:25 cours', '09:20 recreation', '10:30 cours'])
  })

  it('utilise les créneaux enregistrés pour une année clôturée', () => {
    const creneaux = [
      { cycle: 'college', heure_debut: '07:30:00', heure_fin: '08:25:00', type: 'cours' },
      { cycle: 'college', heure_debut: '12:20:00', heure_fin: '14:25:00', type: 'dejeuner' },
    ]
    const { lignes } = grilleArchive(archive({ origine: 'cloture', donnees: { creneaux } as never, seances: seances as never }), ['college'])
    expect(lignes.map((l) => l.type)).toEqual(['cours', 'dejeuner'])
  })

  it('range les années importées avec les emplois du temps faits à la main', () => {
    expect(estFaitMain(archiveCommeSource(archive({})).label)).toBe(true)
    expect(estFaitMain(archiveCommeSource(archive({ origine: 'cloture' })).label)).toBe(false)
  })
})
