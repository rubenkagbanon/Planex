import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
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

interface ProfesseurRow {
  key: string
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

export function Professeurs() {
  const { data: profile } = useProfile()
  const etablissementId = profile?.etablissement_id ?? null
  const queryClient = useQueryClient()

  const [rows, setRows] = useState<ProfesseurRow[]>([])
  const [hydrated, setHydrated] = useState(false)
  const [viewMode, setViewMode] = useState<'fiches' | 'tableau'>('fiches')
  const [indisponibiliteNom, setIndisponibiliteNom] = useState<string | null>(null)
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
      const { error: deleteError } = await supabase
        .from('professeurs')
        .delete()
        .eq('etablissement_id', etablissementId)
      if (deleteError) throw deleteError

      const classesMap = classesParNiveauEtablissement ?? {}
      const validRows = rows.filter((r) => r.nomComplet.trim() && r.matiere)
      if (validRows.length > 0) {
        const insertRows = validRows.map((r) => ({
          etablissement_id: etablissementId,
          nom_complet: r.nomComplet.trim(),
          matiere: r.matiere,
          niveaux: classeCodesForRow(r),
          volume_horaire: computedVolumeMinutes(r, classesMap, horairesGrid) / 60,
          remarque: r.remarque.trim() || null,
        }))
        const { error: insertError } = await supabase.from('professeurs').insert(insertRows)
        if (insertError) throw insertError
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
    <div className={viewMode === 'tableau' ? 'max-w-6xl' : 'max-w-3xl'}>
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
          <button
            type="button"
            onClick={() => setViewMode(viewMode === 'fiches' ? 'tableau' : 'fiches')}
            className="whitespace-nowrap text-xs font-semibold text-primary hover:underline"
          >
            {viewMode === 'fiches' ? 'Voir en tableau' : 'Voir en fiches'}
          </button>
        </div>
      </div>

      {saveMutation.isSuccess && <p className="mb-4 text-sm text-primary">Enregistré.</p>}
      {saveMutation.isError && (
        <p className="mb-4 text-sm text-destructive">
          {saveMutation.error instanceof Error ? saveMutation.error.message : 'Échec de l’enregistrement.'}
        </p>
      )}

      {viewMode === 'tableau' && (
        <div className="mb-6 overflow-x-auto rounded-xl border border-border">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-secondary text-secondary-foreground">
                <th className="whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide">
                  Professeur
                </th>
                <th className="whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide">
                  Matière
                </th>
                <th className="whitespace-nowrap px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide">
                  Nb classes
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide">
                  Nb classes (détail)
                </th>
                <th className="whitespace-nowrap px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide">
                  Heures/semaine
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide">Remarque</th>
                <th className="w-8 px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.key} className={cn('border-t border-border', i % 2 === 0 ? 'bg-card' : 'bg-background')}>
                  <td className="whitespace-nowrap px-3 py-2 font-medium text-foreground">{row.nomComplet}</td>
                  <td className="px-3 py-2 text-muted-foreground">{row.matiere}</td>
                  <td className="px-3 py-2 text-center text-muted-foreground">{classeCodesForRow(row).length}</td>
                  <td className="px-3 py-2 text-muted-foreground">{detailTextForRow(row)}</td>
                  <td className="px-3 py-2 text-center text-muted-foreground">
                    {formatVolumeLabel(computedVolumeMinutes(row, classesMap, horairesGrid))}
                  </td>
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
      )}

      {viewMode === 'fiches' && (
      <div className="flex flex-col gap-4">
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
