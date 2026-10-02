import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useProfile } from '@/hooks/useProfile'
import { useEmploiDuTempsData } from '@/hooks/useEmploiDuTempsData'
import { DISCIPLINES } from '@/lib/horairesReference'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

type TypeRegroupement = 'tronc_commun' | 'tandem'

interface RegroupementRow {
  key: string
  type: TypeRegroupement
  libelle: string
  matieres: string[]
  classes: string[]
}

function newKey() {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
        active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

export function Regroupements() {
  const { data: profile } = useProfile()
  const etablissementId = profile?.etablissement_id ?? null
  const queryClient = useQueryClient()
  const { data: edt } = useEmploiDuTempsData(etablissementId)
  const [rows, setRows] = useState<RegroupementRow[]>([])
  const [hydrated, setHydrated] = useState(false)

  const { data: existing } = useQuery({
    queryKey: ['regroupements', etablissementId],
    queryFn: async () => {
      const { data, error } = await supabase.from('regroupements').select('*').eq('etablissement_id', etablissementId!).order('created_at')
      if (error) throw error
      return data
    },
    enabled: !!etablissementId,
  })

  useEffect(() => {
    if (hydrated || !existing) return
    setRows(existing.map((r) => ({ key: newKey(), type: r.type as TypeRegroupement, libelle: r.libelle ?? '', matieres: r.matieres, classes: r.classes })))
    setHydrated(true)
  }, [existing, hydrated])

  const saveMutation = useMutation({
    mutationFn: async () => {
      const id = etablissementId!
      for (const r of rows) {
        if (r.type === 'tronc_commun' && (r.matieres.length !== 1 || r.classes.length < 2)) {
          throw new Error('Un tronc commun = une matière et au moins deux classes.')
        }
        if (r.type === 'tandem' && (r.matieres.length < 1 || r.classes.length < 1)) {
          throw new Error('Un tandem = au moins une matière et une classe.')
        }
      }
      const { error: deleteError } = await supabase.from('regroupements').delete().eq('etablissement_id', id)
      if (deleteError) throw deleteError
      if (rows.length > 0) {
        const { error } = await supabase.from('regroupements').insert(
          rows.map((r) => ({ etablissement_id: id, type: r.type, libelle: r.libelle.trim() || null, matieres: r.matieres, classes: r.classes })),
        )
        if (error) throw error
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['regroupements', etablissementId] }),
  })

  function update(key: string, patch: Partial<RegroupementRow>) {
    setRows((current) => current.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }

  function toggle(list: string[], value: string) {
    return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
  }

  // Professeur(s) de la matière dans chaque classe sélectionnée — aide à vérifier qu'un tronc commun a bien
  // un seul professeur pour toutes ses classes.
  function professeursDe(matiere: string, classeCode: string): string[] {
    const [niveau] = classeCode.split('-')
    return [
      ...new Set(
        (edt?.professeurs ?? [])
          .filter((p) => p.matiere === matiere && (p.niveaux.includes(classeCode) || p.niveaux.includes(niveau)))
          .map((p) => p.nom_complet),
      ),
    ]
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="text-sm text-muted-foreground">
          <p>
            <strong>Tronc commun</strong> : plusieurs classes suivent ensemble le même cours — même professeur, même
            salle, même créneau (ex. EPS de deux classes sur le terrain, Philosophie de Tle A2 1 et 2).
          </p>
          <p className="mt-1">
            <strong>Tandem</strong> : une classe est scindée en groupes qui ont cours en même temps dans des salles
            différentes, un groupe par matière (ex. S.V.T. / Physique-Chimie). Les groupes d'une même matière avec
            deux professeurs (LV2 Allemand / Espagnol) sont détectés automatiquement (règle dans Horaires &amp;
            contraintes).
          </p>
        </div>
        <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !etablissementId}>
          {saveMutation.isPending ? 'Enregistrement...' : 'Enregistrer'}
        </Button>
      </div>

      {saveMutation.isSuccess && <p className="mb-4 text-sm text-primary">Enregistré.</p>}
      {saveMutation.isError && (
        <p className="mb-4 text-sm text-destructive">
          {saveMutation.error instanceof Error ? saveMutation.error.message : 'Échec de l’enregistrement.'}
        </p>
      )}

      <div className="mb-4 flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setRows((current) => [...current, { key: newKey(), type: 'tronc_commun', libelle: '', matieres: [], classes: [] }])}
        >
          + Tronc commun
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setRows((current) => [...current, { key: newKey(), type: 'tandem', libelle: '', matieres: [], classes: [] }])}
        >
          + Tandem
        </Button>
      </div>

      {rows.length === 0 && <p className="text-sm text-muted-foreground">Aucun regroupement déclaré.</p>}

      <div className="flex flex-col gap-4">
        {rows.map((r) => (
          <div key={r.key} className="rounded-xl border border-border bg-card p-5">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div className="flex flex-1 items-end gap-3">
                <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground">
                  {r.type === 'tronc_commun' ? 'Tronc commun' : 'Tandem'}
                </span>
                <div className="flex flex-1 flex-col gap-1">
                  <Label className="text-xs">Libellé (facultatif)</Label>
                  <Input value={r.libelle} onChange={(e) => update(r.key, { libelle: e.target.value })} placeholder="ex. EPS 3e 1 + 3e 2" />
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRows((current) => current.filter((x) => x.key !== r.key))}
                className="mt-6 text-muted-foreground hover:text-destructive"
                aria-label="Supprimer ce regroupement"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <Label className="mb-2 block text-xs">{r.type === 'tronc_commun' ? 'Matière' : 'Matières des groupes'}</Label>
            <div className="mb-4 flex flex-wrap gap-1.5">
              {DISCIPLINES.map((d) => (
                <Chip
                  key={d}
                  active={r.matieres.includes(d)}
                  onClick={() => update(r.key, { matieres: r.type === 'tronc_commun' ? [d] : toggle(r.matieres, d) })}
                >
                  {d}
                </Chip>
              ))}
            </div>

            <Label className="mb-2 block text-xs">{r.type === 'tronc_commun' ? 'Classes réunies' : 'Classes concernées'}</Label>
            <div className="flex flex-wrap gap-1.5">
              {(edt?.classeOptions ?? []).map((c) => (
                <Chip key={c.key} active={r.classes.includes(c.key)} onClick={() => update(r.key, { classes: toggle(r.classes, c.key) })}>
                  {c.label}
                </Chip>
              ))}
            </div>

            {r.type === 'tronc_commun' && r.matieres[0] && r.classes.length > 0 && (
              <p className="mt-3 text-xs text-muted-foreground">
                Professeurs :{' '}
                {r.classes
                  .map((code) => `${edt?.classeOptions.find((c) => c.key === code)?.label ?? code} → ${professeursDe(r.matieres[0], code).join(', ') || 'aucun'}`)
                  .join(' · ')}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
