import { horairesDuModele } from '@/lib/apprentissage'
import type { Cycle } from '@/lib/cycle'
import type { Json, Tables } from '@/lib/database.types'
import { NIVEAUX_ETABLISSEMENT } from '@/lib/horairesReference'
import type { LigneVersion } from '@/lib/importEdtPdf'

// Bibliothèque des années scolaires (table annees_archivees) : lecture d'une année archivée pour la
// consulter, l'exporter en Excel, la comparer à l'année en cours ou en apprendre les habitudes.

export type AnneeArchivee = Tables<'annees_archivees'>

export interface DonneesArchive {
  etablissement?: Partial<Tables<'etablissements'>>
  creneaux?: { cycle: string; heure_debut: string; heure_fin: string; type: string }[]
  classes_details?: { niveau: string; section: number; professeur_principal: string | null; salle_nom: string | null }[]
  horaires_contraintes?: { cycle: string; jours_cours: string[]; mercredi_apres_midi_banalise: boolean }[]
  professeurs?: { nom_complet: string; matiere: string }[]
}

export const donneesArchive = (a: AnneeArchivee) => (a.donnees ?? {}) as unknown as DonneesArchive
export const seancesArchive = (a: AnneeArchivee) => (a.seances ?? []) as unknown as LigneVersion[]

export interface VersionArchivee {
  label: string
  created_at: string
  nb_seances: number
  seances: Json
}
export const versionsArchive = (a: AnneeArchivee) => (a.versions ?? []) as unknown as VersionArchivee[]

// Une année archivée vue comme une « version » : même forme que emploi_du_temps_versions, pour la réutiliser
// dans Comparer et Apprendre d'un modèle.
export interface SourceEmploiDuTemps {
  id: string
  label: string
  nb_seances: number
  created_at: string
  seances: Json
  // 'version' : version de l'année en cours ; 'archive' : année de la bibliothèque
  provenance: 'version' | 'archive'
  origine?: string
}

export function archiveCommeSource(a: AnneeArchivee): SourceEmploiDuTemps {
  return {
    id: `archive:${a.id}`,
    label: a.origine === 'import' ? `Année ${a.annee_scolaire} — importée des PDF (bibliothèque)` : `Année ${a.annee_scolaire} — clôturée (bibliothèque)`,
    nb_seances: a.nb_seances,
    created_at: a.created_at,
    seances: a.seances,
    provenance: 'archive',
    origine: a.origine,
  }
}

export type TypeDocArchive = 'classe' | 'professeur' | 'salle'

export interface DocArchive {
  key: string
  titre: string
  cycles: Cycle[]
  seances: LigneVersion[]
}

const ordreNiveau = (n: string) => NIVEAUX_ETABLISSEMENT.findIndex((x) => x.key === n)
const libelleNiveau = (n: string) => NIVEAUX_ETABLISSEMENT.find((x) => x.key === n)?.label ?? n

export function documentsArchive(lignes: LigneVersion[], type: TypeDocArchive): DocArchive[] {
  const groupes = new Map<string, LigneVersion[]>()
  const cle = (s: LigneVersion) => (type === 'classe' ? `${s.niveau}-${s.section}` : type === 'professeur' ? s.professeur_nom : s.salle_nom ?? '')
  for (const s of lignes) {
    const k = cle(s)
    if (!k) continue
    groupes.set(k, [...(groupes.get(k) ?? []), s])
  }
  return [...groupes.entries()]
    .map(([key, seances]) => ({
      key,
      titre:
        type === 'classe'
          ? `${libelleNiveau(seances[0].niveau)} ${seances[0].section}`
          : type === 'professeur'
            ? key
            : `Salle ${key}`,
      cycles: [...new Set(seances.map((s) => s.cycle as Cycle))].sort(),
      seances,
    }))
    .sort((a, b) =>
      type === 'classe'
        ? ordreNiveau(a.seances[0].niveau) - ordreNiveau(b.seances[0].niveau) || a.seances[0].section - b.seances[0].section
        : a.titre.localeCompare(b.titre, 'fr', { numeric: true }),
    )
}

export interface LigneGrilleArchive {
  heureDebut: string
  heureFin: string
  type: 'cours' | 'recreation' | 'dejeuner'
}

// Lignes de la grille (créneaux et pauses) : celles enregistrées avec l'année si elle a été clôturée dans
// Planex, sinon reconstruites à partir des séances (année importée des PDF).
export function grilleArchive(archive: AnneeArchivee, cycles: Cycle[]): { lignes: LigneGrilleArchive[]; jours: string[] } {
  const donnees = donneesArchive(archive)
  const seances = seancesArchive(archive).filter((s) => cycles.includes(s.cycle as Cycle))
  const ordreJours = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']
  const creneaux = (donnees.creneaux ?? []).filter((c) => cycles.includes(c.cycle as Cycle))
  if (creneaux.length > 0) {
    const parHeure = new Map<string, LigneGrilleArchive>()
    for (const c of creneaux) parHeure.set(c.heure_debut, { heureDebut: c.heure_debut, heureFin: c.heure_fin, type: c.type as LigneGrilleArchive['type'] })
    const joursConfig = (donnees.horaires_contraintes ?? []).filter((h) => cycles.includes(h.cycle as Cycle)).flatMap((h) => h.jours_cours)
    const jours = ordreJours.filter((j) => joursConfig.includes(j) || seances.some((s) => s.jour === j))
    return { lignes: [...parHeure.values()].sort((a, b) => a.heureDebut.localeCompare(b.heureDebut)), jours }
  }
  const horaires = horairesDuModele(seances.map((s) => ({ cycle: s.cycle as Cycle, jour: s.jour, heureDebut: s.heure_debut, heureFin: s.heure_fin })))
  const parHeure = new Map<string, LigneGrilleArchive>()
  for (const h of horaires) for (const c of h.creneaux) parHeure.set(c.heureDebut, c)
  const jours = ordreJours.filter((j) => horaires.some((h) => h.jours.includes(j)))
  return { lignes: [...parHeure.values()].sort((a, b) => a.heureDebut.localeCompare(b.heureDebut)), jours }
}

const h = (hhmmss: string) => hhmmss.slice(0, 5).replace(':', 'h')
const JOUR_LABEL: Record<string, string> = { lundi: 'LUNDI', mardi: 'MARDI', mercredi: 'MERCREDI', jeudi: 'JEUDI', vendredi: 'VENDREDI', samedi: 'SAMEDI' }

export function texteCase(seances: LigneVersion[], type: TypeDocArchive): string {
  return seances
    .map((s) =>
      [
        s.matiere,
        type === 'professeur' ? `${libelleNiveau(s.niveau)} ${s.section}` : s.professeur_nom,
        type === 'salle' ? `${libelleNiveau(s.niveau)} ${s.section}` : s.salle_nom,
      ]
        .filter(Boolean)
        .join(' · '),
    )
    .join(' / ')
}

// Classeur Excel d'une année archivée : une feuille par classe, professeur ou salle.
export async function exporterArchiveExcel(archive: AnneeArchivee, type: TypeDocArchive) {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  const noms = new Set<string>()
  const etab = donneesArchive(archive).etablissement
  for (const doc of documentsArchive(seancesArchive(archive), type)) {
    const { lignes, jours } = grilleArchive(archive, doc.cycles)
    const aoa: string[][] = [
      [etab?.name ?? ''],
      [`Année scolaire : ${archive.annee_scolaire}`],
      [doc.titre],
      [],
      ['HORAIRES', ...jours.map((j) => JOUR_LABEL[j] ?? j)],
    ]
    for (const l of lignes) {
      const horaire = `${h(l.heureDebut)} - ${h(l.heureFin)}`
      if (l.type !== 'cours') {
        aoa.push([horaire, l.type === 'recreation' ? 'RÉCRÉATION' : 'PAUSE DÉJEUNER'])
        continue
      }
      aoa.push([horaire, ...jours.map((j) => texteCase(doc.seances.filter((s) => s.jour === j && s.heure_debut === l.heureDebut), type))])
    }
    const feuille = XLSX.utils.aoa_to_sheet(aoa)
    feuille['!cols'] = [{ wch: 14 }, ...jours.map(() => ({ wch: 26 }))]
    let nom = doc.titre.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31).trim() || 'Feuille'
    for (let i = 2; noms.has(nom); i++) nom = `${nom.slice(0, 28)} ${i}`
    noms.add(nom)
    XLSX.utils.book_append_sheet(wb, feuille, nom)
  }
  XLSX.writeFile(wb, `Emplois_du_temps_${archive.annee_scolaire}_${type === 'classe' ? 'classes' : type === 'professeur' ? 'professeurs' : 'salles'}.xlsx`)
}

// « 2025-2026 » → « 2026-2027 » ; « 2025–2026 » accepté
export function anneeSuivante(annee: string | null | undefined): string {
  const m = (annee ?? '').match(/(\d{4})\s*[-–/]\s*(\d{4})/)
  if (!m) return ''
  return `${Number(m[1]) + 1}-${Number(m[2]) + 1}`
}
