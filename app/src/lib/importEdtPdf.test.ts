import { describe, expect, it } from 'vitest'
import { codeClasseCompact, extrairePdf, harmoniserProfesseurs, IGNORER, nettoyerNom, type ClassePdf, type TextePdf } from './importEdtPdf'

// Page de démonstration au format « grille » (comme les PDF Word du Groupe Scolaire Vatican II) : en-tête
// avec les professeurs par matière, puis LUNDI… VENDREDI et une ligne par horaire.
const t = (s: string, x: number, y: number): TextePdf => ({ s, x, y, largeur: s.length * 6 })
function page(classe: TextePdf[], cases: TextePdf[], entete: TextePdf[] = []): TextePdf[] {
  return [
    t('EMPLOI DU TEMPS CLASSE 2025- 2026', 177, 731),
    t('CLASSE :', 71, 643),
    ...classe,
    t('SALLE : 1', 71, 622),
    t('PC: M. KOUADIO Wilfred', 71, 593),
    t('MATHS: M. VOLE BI', 71, 564),
    t('FR: M. GUIOUNOU', 71, 535),
    t('SVT: M. GNAMBA', 71, 506),
    t('PP : M. VOLE BI', 71, 361),
    ...entete,
    t('LUNDI', 186, 331),
    t('MARDI', 255, 331),
    t('MERCREDI', 325, 331),
    t('JEUDI', 405, 331),
    t('VENDREDI', 475, 331),
    t('07H30-08H25', 77, 311),
    t('08H25-09H20', 77, 291),
    t('09H20- 10H15', 77, 271),
    t('10H30 -11H20', 77, 231),
    ...cases,
  ]
}

describe('lecture des PDF au format grille', () => {
  const classe6e1 = [t('6', 129, 643), t('e', 138, 648), t('1', 143, 643)]

  it('lit la classe, le professeur principal, les cases, la salle et les groupes en parallèle', () => {
    const { classes, erreurs } = extrairePdf(
      [page(classe6e1, [t('FR', 255, 291), t('MATH', 329, 271), t('MATH S9', 186, 231), t('SVT/PC', 408, 311)])],
      'edt.pdf',
    )
    expect(erreurs).toEqual([])
    const [c] = classes
    expect(`${c.niveau}-${c.section}`).toBe('6e-1')
    expect(c.professeurPrincipal).toBe('M. VOLE BI')
    const ligne = (jour: string, debut: string) => c.seances.filter((s) => s.jour === jour && s.debut === debut)
    expect(ligne('mardi', '08:25:00')[0]).toMatchObject({ matiere: 'Français', professeur: 'M. GUIOUNOU', salle: 'S1', fin: '09:20:00' })
    expect(ligne('lundi', '10:30:00')[0]).toMatchObject({ matiere: 'Mathématiques', salle: 'S9' })
    expect(ligne('jeudi', '07:30:00').map((s) => [s.matiere, s.professeur, s.tandem])).toEqual([
      ['S.V.T.', 'M. GNAMBA', true],
      ['Physique-Chimie', 'M. KOUADIO Wilfred', true],
    ])
    expect(c.heuresLues).toBe(4)
  })

  it('signale un libellé inconnu, puis le lit avec la correspondance choisie par le censeur', () => {
    const pages = [page(classe6e1, [t('FR', 255, 291), t('ETUDE', 186, 311)])]
    const avant = extrairePdf(pages, 'edt.pdf').classes[0]
    expect(avant.libellesInconnus).toEqual(['ETUDE'])
    expect(avant.seances).toHaveLength(1)
    const ignore = extrairePdf(pages, 'edt.pdf', { correspondances: { ETUDE: IGNORER } }).classes[0]
    expect(ignore.libellesInconnus).toEqual([])
    expect(ignore.seances).toHaveLength(1)
    const commeFrancais = extrairePdf(pages, 'edt.pdf', { correspondances: { ETUDE: 'Français' } }).classes[0]
    expect(commeFrancais.seances).toHaveLength(2)
  })

  it('ignore une page modèle vierge et explique un PDF scanné', () => {
    expect(extrairePdf([page([], [])], 'modele.pdf').classes).toEqual([])
    expect(extrairePdf([[], []], 'scan.pdf').erreurs[0].erreur).toMatch(/scanné/)
  })
})

describe('noms de classes et de professeurs', () => {
  it('reconnaît les écritures courantes des classes', () => {
    expect(codeClasseCompact('6e1')).toEqual({ niveau: '6e', section: 1 })
    expect(codeClasseCompact('6ème 2')).toEqual({ niveau: '6e', section: 2 })
    expect(codeClasseCompact('2ndC')).toEqual({ niveau: '2ndeC', section: 1 })
    expect(codeClasseCompact('1ereD')).toEqual({ niveau: '1reD', section: 1 })
    expect(codeClasseCompact('Tle A2 3')).toEqual({ niveau: 'TleA2', section: 3 })
  })

  it('nettoie les civilités', () => {
    expect(nettoyerNom('M.N’DRI')).toBe('M. N’DRI')
    expect(nettoyerNom('M. Mme KADJA')).toBe('Mme KADJA')
  })

  it('réunit les écritures d’un même professeur sans confondre deux personnes', () => {
    const classe = (seances: [string, string][]): ClassePdf => ({
      fichier: 'x',
      niveau: '6e',
      section: 1,
      cycle: 'college',
      professeurPrincipal: null,
      heuresAnnoncees: null,
      heuresLues: 0,
      anomalies: [],
      seances: seances.map(([matiere, professeur]) => ({ jour: 'lundi', debut: '07:30:00', fin: '08:25:00', matiere, libelle: '', salle: null, professeur, tandem: false })),
    })
    const [c] = harmoniserProfesseurs([
      classe([
        ['Physique-Chimie', 'M. KOUADIO Wilfred'],
        ['Physique-Chimie', 'M. KOUADIO'],
        ['L.V.2 (All./Esp.)', 'Mlle KOUADIO'],
        ['Anglais', 'Mme KADJA'],
        ['Anglais', 'M. KADJA'],
        ['S.V.T.', 'GNAMBA'],
        ['S.V.T.', 'M. GNAMBA'],
      ]),
    ])
    expect(c.seances.map((s) => s.professeur)).toEqual([
      'M. KOUADIO Wilfred',
      'M. KOUADIO Wilfred',
      'Mlle KOUADIO',
      'Mme KADJA',
      'Mme KADJA',
      'M. GNAMBA',
      'M. GNAMBA',
    ])
  })
})
