import { describe, expect, it } from 'vitest'
import { lireProfesseurs, reconnaitreClasse, reconnaitreMatiere } from './importProfesseurs'

describe('import Excel des professeurs', () => {
  it('reconnaît les matières écrites librement', () => {
    expect(reconnaitreMatiere('MATHÉMATIQUES')).toBe('Mathématiques')
    expect(reconnaitreMatiere('PH-CH')).toBe('Physique-Chimie')
    expect(reconnaitreMatiere('Allemand')).toBe('L.V.2 (All./Esp.)')
    expect(reconnaitreMatiere('H.G')).toBe('Histoire-Géographie')
    expect(reconnaitreMatiere('EDHC')).toBe('E.D.H.C.')
    expect(reconnaitreMatiere('Cuisine')).toBeNull()
  })

  it('reconnaît les classes au format des emplois du temps', () => {
    expect(reconnaitreClasse('3EME 1')).toBe('3e-1')
    expect(reconnaitreClasse('3e2')).toBe('3e-2')
    expect(reconnaitreClasse('6e')).toBe('6e')
    expect(reconnaitreClasse('2nde A 3')).toBe('2ndeA-3')
    expect(reconnaitreClasse('1ère A2 1')).toBe('1reA2-1')
    expect(reconnaitreClasse('TLE D 2')).toBe('TleD-2')
    expect(reconnaitreClasse('Terminale A1')).toBe('TleA1')
    expect(reconnaitreClasse('CP1')).toBeNull()
  })

  it('lit un tableau et signale les erreurs ligne par ligne', () => {
    const { professeurs, erreurs } = lireProfesseurs(
      [
        ['Nom et prénoms', 'Matière', 'Classes', 'Remarque'],
        ['Bamba N.', 'Maths', '3e 1, 3e 3', ''],
        ['Nado P. S.', 'Français, EDHC', '3e 1', 'PP 3e 1'],
        ['Inconnu', 'Cuisine', '3e 1', ''],
        ['Hors limite', 'Anglais', '3e 9', ''],
      ],
      { '3e': 7 },
    )
    expect(professeurs).toHaveLength(3)
    expect(professeurs[0]).toEqual({ nomComplet: 'Bamba N.', matiere: 'Mathématiques', classes: ['3e-1', '3e-3'], remarque: '' })
    expect(professeurs.map((p) => p.matiere)).toEqual(['Mathématiques', 'Français', 'E.D.H.C.'])
    expect(erreurs).toHaveLength(3)
  })
})
