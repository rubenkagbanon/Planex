import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, ArrowUpDown, Download, Upload, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useProfile } from '@/hooks/useProfile'
import { useHorairesGrid, type HorairesGrid } from '@/hooks/useHorairesGrid'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DISCIPLINES, NIVEAUX_ETABLISSEMENT, minutesForNiveauEtablissement, formatMinutes } from '@/lib/horairesReference'
import { parseClasseCode, formatClasseCode, expandNiveauCodes } from '@/lib/classeCode'
import { cycleForNiveau, type Cycle } from '@/lib/cycle'
import { IndisponibilitesModal } from '@/components/IndisponibilitesModal'
import { cn } from '@/lib/utils'
import { lireProfesseurs, MODELE_ENTETES, MODELE_EXEMPLES, type ResultatImport } from '@/lib/importProfesseurs'

interface ProfesseurRow {
  key: string
  // Identifiant de la fiche en base (absent pour une fiche pas encore enregistrée)
  id?: string
  nomComplet: string
  matiere: string
  niveaux: string[]
  classesParNiveau: Record<string, number[]>
  remarque: string
}

function newRowKey() {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`
}

function emptyRow(): ProfesseurRow {
  return {
    key: newRowKey(),
    nomComplet: '',
    matiere: '',
    niveaux: [],
    classesParNiveau: {},
    remarque: '',
  }
}

// Un niveau sans classe précisée compte pour 1 (le niveau lui-même) ; sinon on compte chaque classe choisie.
function classeCodesForRow(row: Pick<ProfesseurRow, 'niveaux' | 'classesParNiveau'>): string[] {
  return row.niveaux.flatMap((niveau) => {
    const sections = row.classesParNiveau[niveau] ?? []
    return sections.length > 0 ? sections.map((s) => `${niveau}-${s}`) : [niveau]
  })
}

function detailTextForRow(row: Pick<ProfesseurRow, 'niveaux' | 'classesParNiveau'>): string {
  return classeCodesForRow(row).map(formatClasseCode).join(', ')
}

// Volume horaire hebdomadaire de la fiche : pour chaque classe réellement couverte (un niveau sans classe
// précisée compte pour toutes les classes de ce niveau, pas juste 1), on additionne le volume horaire de
// la grille de référence pour cette matière/ce niveau — même logique que le moteur de génération.
function computedVolumeMinutes(
  row: Pick<ProfesseurRow, 'matiere' | 'niveaux' | 'classesParNiveau'>,
  classesMap: Record<string, number>,
  grid: HorairesGrid,
): number {
  if (!row.matiere) return 0
  return expandNiveauCodes(classeCodesForRow(row), classesMap).reduce(
    (sum, { niveau }) => sum + minutesForNiveauEtablissement(grid, row.matiere, niveau),
    0,
  )
}

function formatVolumeLabel(totalMinutes: number): string {
  const formatted = formatMinutes(totalMinutes)
  return formatted.includes('h') ? formatted : `${formatted}h`
}

type ColonneTri = 'nom' | 'matiere' | 'classes' | 'heures'

export function Professeurs() {
  const { data: profile } = useProfile()
  const etablissementId = profile?.etablissement_id ?? null
  const queryClient = useQueryClient()

  const [rows, setRows] = useState<ProfesseurRow[]>([])
  const [hydrated, setHydrated] = useState(false)
  const [viewMode, setViewMode] = useState<'fiches' | 'tableau'>('fiches')
  const [indisponibiliteNom, setIndisponibiliteNom] = useState<string | null>(null)
  // Mode tableau : filtres et tri par colonne
  const [filtreTexte, setFiltreTexte] = useState('')
  const [filtreMatiere, setFiltreMatiere] = useState('')
  const [filtreNiveau, setFiltreNiveau] = useState('')
  const [tri, setTri] = useState<{ colonne: ColonneTri; sens: 'asc' | 'desc' }>({ colonne: 'nom', sens: 'asc' })
  const { grid: horairesGrid } = useHorairesGrid(etablissementId)

  const { data: classesParNiveauEtablissement } = useQuery({
    queryKey: ['classes_etablissement_map', etablissementId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('classes_etablissement')
        .select('niveau, nombre_classes')
        .eq('etablissement_id', etablissementId!)
      if (error) throw error
      return Object.fromEntries(data.map((row) => [row.niveau, row.nombre_classes])) as Record<string, number>
    },
    enabled: !!etablissementId,
  })

  const { data: existing } = useQuery({
    queryKey: ['professeurs', etablissementId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('professeurs')
        .select('*')
        .eq('etablissement_id', etablissementId!)
        .order('nom_complet', { ascending: true })
      if (error) throw error
      return data
    },
    enabled: !!etablissementId,
  })

  useEffect(() => {
    if (hydrated || !existing) return
    setRows(
      existing.map((row) => {
        const niveaux: string[] = []
        const classesParNiveau: Record<string, number[]> = {}
        for (const code of row.niveaux) {
          const { niveau, section } = parseClasseCode(code)
          if (!niveaux.includes(niveau)) niveaux.push(niveau)
          if (section !== undefined) {
            classesParNiveau[niveau] = [...(classesParNiveau[niveau] ?? []), section]
          }
        }
        return {
          key: newRowKey(),
          id: row.id,
          nomComplet: row.nom_complet,
          matiere: row.matiere,
          niveaux,
          classesParNiveau,
          remarque: row.remarque ?? '',
        }
      }),
    )
    setHydrated(true)
  }, [existing, hydrated])

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!etablissementId) throw new Error('Établissement introuvable pour ce compte.')
      const classesMap = classesParNiveauEtablissement ?? {}
      const validRows = rows.filter((r) => r.nomComplet.trim() && r.matiere)
      const toDb = (r: ProfesseurRow) => ({
        etablissement_id: etablissementId,
        nom_complet: r.nomComplet.trim(),
        matiere: r.matiere,
        niveaux: classeCodesForRow(r),
        volume_horaire: computedVolumeMinutes(r, classesMap, horairesGrid) / 60,
        remarque: r.remarque.trim() || null,
        updated_at: new Date().toISOString(),
      })

      // Mise à jour en place plutôt que "tout supprimer puis réinsérer" : chaque séance de l'emploi du
      // temps référence sa fiche professeur (suppression en cascade), donc réécrire toutes les fiches
      // effaçait tout l'emploi du temps, séances verrouillées comprises. Seules les fiches réellement
      // retirées de la liste sont supprimées (avec leurs séances).
      const gardees = new Set(validRows.filter((r) => r.id).map((r) => r.id!))
      const supprimees = (existing ?? []).filter((p) => !gardees.has(p.id)).map((p) => p.id)
      if (supprimees.length > 0) {
        const { error } = await supabase.from('professeurs').delete().in('id', supprimees)
        if (error) throw error
      }
      const aMettreAJour = validRows.filter((r) => r.id)
      if (aMettreAJour.length > 0) {
        const { error } = await supabase.from('professeurs').upsert(aMettreAJour.map((r) => ({ id: r.id!, ...toDb(r) })))
        if (error) throw error
      }
      const nouvelles = validRows.filter((r) => !r.id)
      if (nouvelles.length > 0) {
        const { data: inserees, error } = await supabase.from('professeurs').insert(nouvelles.map(toDb)).select('id')
        if (error) throw error
        // Les nouvelles fiches reçoivent leur identifiant : un second enregistrement les met à jour.
        const ids = new Map(nouvelles.map((r, i) => [r.key, inserees[i]?.id]))
        setRows((current) => current.map((r) => (ids.has(r.key) ? { ...r, id: ids.get(r.key) } : r)))
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['professeurs', etablissementId] })
    },
  })

  function addRow() {
    setRows((current) => [emptyRow(), ...current])
  }

  function updateRow(key: string, patch: Partial<Omit<ProfesseurRow, 'key'>>) {
    setRows((current) => current.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }

  function removeRow(key: string) {
    setRows((current) => current.filter((r) => r.key !== key))
  }

  // --- Import Excel -------------------------------------------------------------------------------
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importResult, setImportResult] = useState<(ResultatImport & { fichier: string }) | null>(null)
  const [importError, setImportError] = useState<string | null>(null)

  async function telechargerModele() {
    const XLSX = await import('xlsx')
    const wb = XLSX.utils.book_new()
    const feuille = XLSX.utils.aoa_to_sheet([MODELE_ENTETES, ...MODELE_EXEMPLES])
    feuille['!cols'] = [{ wch: 26 }, { wch: 20 }, { wch: 40 }, { wch: 24 }]
    XLSX.utils.book_append_sheet(wb, feuille, 'Professeurs')
    const aide = XLSX.utils.aoa_to_sheet([
      ['Aide au remplissage'],
      [],
      ['Une ligne par professeur ET par matière (un professeur qui enseigne deux matières a deux lignes).'],
      ['Plusieurs matières dans la même case (séparées par une virgule) créent une fiche par matière, avec les mêmes classes.'],
      ['Classes : séparées par des virgules. "3e" = toutes les classes de 3e ; "3e 2" = uniquement la 3e 2.'],
      ['Abréviations acceptées : MATHS, PH-CH, SVT, HG, EDHC, EPS, ALLEMAND / ESPAGNOL (LV2), PHILO...'],
      [],
      ['Matières reconnues'],
      ...DISCIPLINES.map((d) => [d]),
      [],
      ['Niveaux reconnus'],
      ...NIVEAUX_ETABLISSEMENT.map((n) => [n.label]),
    ])
    aide['!cols'] = [{ wch: 100 }]
    XLSX.utils.book_append_sheet(wb, aide, 'Aide')
    XLSX.writeFile(wb, 'Modele_professeurs_Planex.xlsx')
  }

  async function lireFichier(file: File) {
    setImportError(null)
    try {
      const XLSX = await import('xlsx')
      const wb = XLSX.read(await file.arrayBuffer())
      const feuille = wb.Sheets[wb.SheetNames[0]]
      const lignes = XLSX.utils.sheet_to_json<unknown[]>(feuille, { header: 1, defval: '' })
      setImportResult({ ...lireProfesseurs(lignes, classesParNiveauEtablissement ?? {}), fichier: file.name })
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Fichier illisible.')
    }
  }

  function appliquerImport(mode: 'remplacer' | 'ajouter') {
    if (!importResult) return
    const importees: ProfesseurRow[] = importResult.professeurs.map((p) => {
      const niveaux: string[] = []
      const classesParNiveau: Record<string, number[]> = {}
      for (const code of p.classes) {
        const { niveau, section } = parseClasseCode(code)
        if (!niveaux.includes(niveau)) niveaux.push(niveau)
        if (section !== undefined) classesParNiveau[niveau] = [...(classesParNiveau[niveau] ?? []), section]
      }
      return { key: newRowKey(), nomComplet: p.nomComplet, matiere: p.matiere, niveaux, classesParNiveau, remarque: p.remarque }
    })
    setRows((current) => {
      if (mode === 'ajouter') return [...importees, ...current]
      // Remplacer : on garde l'identifiant des fiches existantes de même nom + matière (leurs séances
      // restent rattachées) ; les autres fiches existantes seront supprimées à l'enregistrement.
      const existantes = new Map(current.filter((r) => r.id).map((r) => [r.nomComplet.trim() + '|' + r.matiere, r.id]))
      return importees.map((r) => ({ ...r, id: existantes.get(r.nomComplet + '|' + r.matiere) }))
    })
    setImportResult(null)
  }

  function toggleNiveau(rowKey: string, niveauKey: string) {
    setRows((current) =>
      current.map((r) => {
        if (r.key !== rowKey) return r
        const active = r.niveaux.includes(niveauKey)
        const { [niveauKey]: _removed, ...restClasses } = r.classesParNiveau
        return {
          ...r,
          niveaux: active ? r.niveaux.filter((n) => n !== niveauKey) : [...r.niveaux, niveauKey],
          classesParNiveau: active ? restClasses : r.classesParNiveau,
        }
      }),
    )
  }

  function toggleClasse(rowKey: string, niveauKey: string, section: number) {
    setRows((current) =>
      current.map((r) => {
        if (r.key !== rowKey) return r
        const existingSections = r.classesParNiveau[niveauKey] ?? []
        const next = existingSections.includes(section)
          ? existingSections.filter((s) => s !== section)
          : [...existingSections, section]
        return { ...r, classesParNiveau: { ...r.classesParNiveau, [niveauKey]: next } }
      }),
    )
  }

  const classesMap = classesParNiveauEtablissement ?? {}

  // Une même personne peut avoir plusieurs fiches (une par matière) — ses indisponibilités concernent
  // tous les cycles où elle enseigne, toutes fiches confondues.
  function cyclesForNom(nom: string): Cycle[] {
    const niveaux = rows.filter((r) => r.nomComplet === nom).flatMap((r) => classeCodesForRow(r))
    return [...new Set(niveaux.map((code) => cycleForNiveau(parseClasseCode(code).niveau)))]
  }

  return (
    <div className={viewMode === 'tableau' ? 'max-w-6xl' : 'max-w-7xl'}>
      <div className="mb-6 flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          Les professeurs qui enseigneront dans l'établissement — une fiche par matière (un professeur qui en
          enseigne plusieurs a plusieurs fiches), avec ses classes précises et son volume horaire hebdomadaire
          pour cette matière.
        </p>
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            {viewMode === 'fiches' && (
              <Button type="button" variant="outline" size="sm" onClick={addRow}>
                + Ajouter un professeur
              </Button>
            )}
            <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !etablissementId}>
              {saveMutation.isPending ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={telechargerModele}
              className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold text-primary hover:underline"
            >
              <Download className="h-3 w-3" /> Modèle Excel
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold text-primary hover:underline"
            >
              <Upload className="h-3 w-3" /> Importer depuis Excel
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) lireFichier(file)
                e.target.value = ''
              }}
            />
          </div>
          <button
            type="button"
            onClick={() => setViewMode(viewMode === 'fiches' ? 'tableau' : 'fiches')}
            className="whitespace-nowrap text-xs font-semibold text-primary hover:underline"
          >
            {viewMode === 'fiches' ? 'Voir en tableau' : 'Voir en fiches'}
          </button>
        </div>
      </div>

      {importError && <p className="mb-4 text-sm text-destructive">{importError}</p>}
      {importResult && (
        <div className="mb-6 rounded-xl border border-primary bg-card p-5">
          <h3 className="mb-1 text-sm font-semibold text-foreground">Import de « {importResult.fichier} »</h3>
          <p className="mb-3 text-sm text-muted-foreground">
            {importResult.professeurs.length} fiche(s) lue(s) pour{' '}
            {new Set(importResult.professeurs.map((p) => p.nomComplet)).size} professeur(s)
            {importResult.erreurs.length > 0 && ', ' + importResult.erreurs.length + ' ligne(s) à corriger'}. Rien
            n'est enregistré tant que tu ne cliques pas sur « Enregistrer ».
          </p>
          {importResult.erreurs.length > 0 && (
            <ul className="mb-3 max-h-40 list-disc overflow-y-auto pl-5 text-xs text-destructive">
              {importResult.erreurs.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => appliquerImport('remplacer')} disabled={importResult.professeurs.length === 0}>
              Remplacer la liste actuelle
            </Button>
            <Button size="sm" variant="outline" onClick={() => appliquerImport('ajouter')} disabled={importResult.professeurs.length === 0}>
              Ajouter à la liste
            </Button>
            <Button size="sm" variant="outline" onClick={() => setImportResult(null)}>
              Annuler
            </Button>
          </div>
        </div>
      )}

      {saveMutation.isSuccess && <p className="mb-4 text-sm text-primary">Enregistré.</p>}
      {saveMutation.isError && (
        <p className="mb-4 text-sm text-destructive">
          {saveMutation.error instanceof Error ? saveMutation.error.message : 'Échec de l’enregistrement.'}
        </p>
      )}

      {viewMode === 'tableau' && (() => {
        const texte = filtreTexte.trim().toLocaleLowerCase('fr-FR')
        const lignes = rows
          .map((row) => ({
            row,
            nbClasses: classeCodesForRow(row).length,
            detail: detailTextForRow(row),
            minutes: computedVolumeMinutes(row, classesMap, horairesGrid),
          }))
          .filter(({ row, detail }) => {
            if (filtreMatiere && row.matiere !== filtreMatiere) return false
            if (filtreNiveau && !row.niveaux.includes(filtreNiveau)) return false
            if (texte && !`${row.nomComplet} ${row.matiere} ${detail} ${row.remarque}`.toLocaleLowerCase('fr-FR').includes(texte)) return false
            return true
          })
          .sort((a, b) => {
            const cmp =
              tri.colonne === 'nom'
                ? a.row.nomComplet.localeCompare(b.row.nomComplet, 'fr')
                : tri.colonne === 'matiere'
                  ? a.row.matiere.localeCompare(b.row.matiere, 'fr') || a.row.nomComplet.localeCompare(b.row.nomComplet, 'fr')
                  : tri.colonne === 'classes'
                    ? a.nbClasses - b.nbClasses
                    : a.minutes - b.minutes
            return tri.sens === 'asc' ? cmp : -cmp
          })
        const totalMinutes = lignes.reduce((sum, l) => sum + l.minutes, 0)
        const enTete = (colonne: ColonneTri, label: ReactNode, centre = false) => {
          const actif = tri.colonne === colonne
          const Icone = !actif ? ArrowUpDown : tri.sens === 'asc' ? ArrowUp : ArrowDown
          return (
            <th className={cn('whitespace-nowrap px-3 py-2 text-xs font-semibold uppercase tracking-wide', centre ? 'text-center' : 'text-left')}>
              <button
                type="button"
                onClick={() => setTri({ colonne, sens: actif && tri.sens === 'asc' ? 'desc' : 'asc' })}
                className="inline-flex items-center gap-1 uppercase hover:underline"
                title={actif && tri.sens === 'asc' ? 'Trier du plus grand au plus petit' : 'Trier du plus petit au plus grand'}
              >
                {label}
                <Icone className={cn('h-3 w-3', !actif && 'opacity-50')} />
              </button>
            </th>
          )
        }
        const filtresActifs = !!(filtreTexte || filtreMatiere || filtreNiveau)
        return (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
              <Input
                value={filtreTexte}
                onChange={(e) => setFiltreTexte(e.target.value)}
                placeholder="Rechercher un professeur, une classe…"
                className="h-9 w-64"
              />
              <select
                value={filtreMatiere}
                onChange={(e) => setFiltreMatiere(e.target.value)}
                className="h-9 rounded-md border border-border bg-card px-2 text-sm"
              >
                <option value="">Toutes les matières</option>
                {DISCIPLINES.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <select
                value={filtreNiveau}
                onChange={(e) => setFiltreNiveau(e.target.value)}
                className="h-9 rounded-md border border-border bg-card px-2 text-sm"
              >
                <option value="">Tous les niveaux</option>
                {NIVEAUX_ETABLISSEMENT.map((n) => (
                  <option key={n.key} value={n.key}>
                    {n.label}
                  </option>
                ))}
              </select>
              {filtresActifs && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setFiltreTexte('')
                    setFiltreMatiere('')
                    setFiltreNiveau('')
                  }}
                >
                  Effacer les filtres
                </Button>
              )}
              <span className="ml-auto text-xs text-muted-foreground">
                {lignes.length} fiche{lignes.length > 1 ? 's' : ''}
                {filtresActifs ? ` sur ${rows.length}` : ''} · {formatVolumeLabel(totalMinutes)} au total
              </span>
            </div>
            <div className="mb-6 overflow-x-auto rounded-xl border border-border">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-secondary text-secondary-foreground">
                    {enTete('nom', 'Professeur')}
                    {enTete('matiere', 'Matière')}
                    {enTete('classes', 'Nb classes', true)}
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide">Nb classes (détail)</th>
                    {enTete('heures', 'Heures/semaine', true)}
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide">Remarque</th>
                    <th className="w-8 px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {lignes.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-3 py-6 text-center text-sm text-muted-foreground">
                        Aucun professeur ne correspond aux filtres.
                      </td>
                    </tr>
                  )}
                  {lignes.map(({ row, nbClasses, detail, minutes }, i) => (
                    <tr key={row.key} className={cn('border-t border-border', i % 2 === 0 ? 'bg-card' : 'bg-background')}>
                      <td className="whitespace-nowrap px-3 py-2 font-medium text-foreground">{row.nomComplet}</td>
                      <td className="px-3 py-2 text-muted-foreground">{row.matiere}</td>
                      <td className="px-3 py-2 text-center text-muted-foreground">{nbClasses}</td>
                      <td className="px-3 py-2 text-muted-foreground">{detail}</td>
                      <td className="px-3 py-2 text-center text-muted-foreground">{formatVolumeLabel(minutes)}</td>
                      <td className="px-3 py-2 text-muted-foreground">{row.remarque}</td>
                      <td className="px-2 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => removeRow(row.key)}
                          className="text-muted-foreground hover:text-destructive"
                          aria-label="Supprimer ce professeur"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )
      })()}

      {viewMode === 'fiches' && (
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        {rows.map((row) => (
          <div key={row.key} className="rounded-xl border border-border bg-card p-5">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div className="flex flex-1 flex-col gap-2">
                <Label>Noms et prénoms</Label>
                <Input value={row.nomComplet} onChange={(e) => updateRow(row.key, { nomComplet: e.target.value })} />
              </div>
              {row.nomComplet.trim() && (
                <button
                  type="button"
                  onClick={() => setIndisponibiliteNom(row.nomComplet.trim())}
                  className="mt-7 whitespace-nowrap text-xs font-semibold text-primary hover:underline"
                >
                  Indisponibilités
                </button>
              )}
              <button
                type="button"
                onClick={() => removeRow(row.key)}
                className="mt-7 text-muted-foreground hover:text-destructive"
                aria-label="Supprimer ce professeur"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mb-4">
              <Label className="mb-2 block">Matière</Label>
              <p className="mb-2 text-xs text-muted-foreground">
                Une matière par fiche — un professeur qui en enseigne plusieurs a une fiche par matière (avec
                ses propres classes et son propre volume horaire).
              </p>
              <div className="flex flex-wrap gap-1.5">
                {DISCIPLINES.map((d) => {
                  const active = row.matiere === d
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => updateRow(row.key, { matiere: d })}
                      className={cn(
                        'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                        active
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-background text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {d}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label>Volume horaire</Label>
                <div className="flex h-10 w-full items-center rounded-md border border-border bg-muted/40 px-3 text-sm text-foreground">
                  {formatVolumeLabel(computedVolumeMinutes(row, classesMap, horairesGrid))}
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label>Remarque</Label>
                <Input
                  value={row.remarque}
                  onChange={(e) => updateRow(row.key, { remarque: e.target.value })}
                  placeholder="Optionnel"
                />
              </div>
            </div>

            <div>
              <Label className="mb-2 block">Niveaux</Label>
              <p className="mb-2 text-xs text-muted-foreground">
                Survole un niveau sélectionné comptant plusieurs classes pour choisir lesquelles précisément —
                ton choix reste enregistré même une fois la bulle refermée.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {NIVEAUX_ETABLISSEMENT.map((n) => {
                  const active = row.niveaux.includes(n.key)
                  const nombreClasses = classesMap[n.key] ?? 1
                  const hasSousClasses = active && nombreClasses > 1
                  const selected = row.classesParNiveau[n.key] ?? []
                  return (
                    <div key={n.key} className={cn('relative', hasSousClasses && 'group')}>
                      <button
                        type="button"
                        onClick={() => toggleNiveau(row.key, n.key)}
                        className={cn(
                          'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                          active
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border bg-background text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {n.label}
                        {hasSousClasses && selected.length > 0 && ` (${selected.length})`}
                      </button>

                      {hasSousClasses && (
                        <div className="invisible absolute left-0 top-full z-20 mt-1 w-52 rounded-lg border border-border bg-card p-3 opacity-0 shadow-lg transition-opacity duration-100 group-hover:visible group-hover:opacity-100">
                          <div className="mb-2 text-xs font-semibold text-muted-foreground">
                            Classes de {n.label} ({nombreClasses}) :
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {Array.from({ length: nombreClasses }, (_, i) => i + 1).map((section) => {
                              const sectionActive = selected.includes(section)
                              return (
                                <button
                                  key={section}
                                  type="button"
                                  onClick={() => toggleClasse(row.key, n.key, section)}
                                  className={cn(
                                    'rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
                                    sectionActive
                                      ? 'border-primary bg-primary text-primary-foreground'
                                      : 'border-border bg-background text-muted-foreground hover:text-foreground',
                                  )}
                                >
                                  {n.label} {section}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        ))}
      </div>
      )}

      {indisponibiliteNom && etablissementId && (
        <IndisponibilitesModal
          etablissementId={etablissementId}
          nomComplet={indisponibiliteNom}
          cycles={cyclesForNom(indisponibiliteNom)}
          onClose={() => setIndisponibiliteNom(null)}
        />
      )}
    </div>
  )
}
