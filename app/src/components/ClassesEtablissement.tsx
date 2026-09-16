import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useProfile } from '@/hooks/useProfile'
import { Button } from '@/components/ui/button'
import { NIVEAUX_ETABLISSEMENT } from '@/lib/horairesReference'

const COLLEGE_NIVEAUX = NIVEAUX_ETABLISSEMENT.slice(0, 4)
const LYCEE_NIVEAUX = NIVEAUX_ETABLISSEMENT.slice(4)

interface NiveauState {
  active: boolean
  nombreClasses: string
}

type FormState = Record<string, NiveauState>

function buildEmptyForm(): FormState {
  return Object.fromEntries(NIVEAUX_ETABLISSEMENT.map((n) => [n.key, { active: false, nombreClasses: '1' }]))
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="relative h-6 w-[42px] shrink-0 rounded-full transition-colors duration-150"
      style={{ background: checked ? '#2F6F52' : '#D9D0B8' }}
    >
      <span
        className="absolute top-[3px] h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-[left] duration-150"
        style={{ left: checked ? '21px' : '3px' }}
      />
    </button>
  )
}

function NiveauRow({
  label,
  state,
  onChange,
}: {
  label: string
  state: NiveauState
  onChange: (value: NiveauState) => void
}) {
  return (
    <div className="flex items-center justify-between gap-6 border-t border-border px-5 py-3.5 first:border-t-0">
      <span className="text-sm font-medium text-foreground">{label}</span>
      <div className="flex items-center gap-4">
        {state.active && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="number"
              min={1}
              max={30}
              value={state.nombreClasses}
              onChange={(e) => onChange({ ...state, nombreClasses: e.target.value })}
              onBlur={() =>
                onChange({
                  ...state,
                  nombreClasses: String(Math.min(30, Math.max(1, parseInt(state.nombreClasses, 10) || 1))),
                })
              }
              className="w-14 rounded-md border border-border bg-card px-2 py-1 text-center text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            classe{Number(state.nombreClasses) > 1 ? 's' : ''}
          </label>
        )}
        <Toggle checked={state.active} onChange={(active) => onChange({ ...state, active })} />
      </div>
    </div>
  )
}

export function ClassesEtablissement() {
  const { data: profile } = useProfile()
  const etablissementId = profile?.etablissement_id ?? null
  const queryClient = useQueryClient()

  const [form, setForm] = useState<FormState>(buildEmptyForm)
  const [hydrated, setHydrated] = useState(false)

  const { data: existing } = useQuery({
    queryKey: ['classes_etablissement', etablissementId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('classes_etablissement')
        .select('niveau, nombre_classes')
        .eq('etablissement_id', etablissementId!)
      if (error) throw error
      return data
    },
    enabled: !!etablissementId,
  })

  useEffect(() => {
    if (hydrated || !existing) return
    if (existing.length > 0) {
      setForm((current) => {
        const next = { ...current }
        for (const row of existing) {
          next[row.niveau] = { active: true, nombreClasses: String(row.nombre_classes) }
        }
        return next
      })
    }
    setHydrated(true)
  }, [existing, hydrated])

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!etablissementId) throw new Error('Établissement introuvable pour ce compte.')
      const { error: deleteError } = await supabase
        .from('classes_etablissement')
        .delete()
        .eq('etablissement_id', etablissementId)
      if (deleteError) throw deleteError

      const rows = NIVEAUX_ETABLISSEMENT.filter((n) => form[n.key]?.active).map((n) => ({
        etablissement_id: etablissementId,
        niveau: n.key,
        nombre_classes: Math.max(1, parseInt(form[n.key].nombreClasses, 10) || 1),
      }))
      if (rows.length > 0) {
        const { error: insertError } = await supabase.from('classes_etablissement').insert(rows)
        if (insertError) throw insertError
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['classes_etablissement', etablissementId] })
    },
  })

  function updateNiveau(key: string, value: NiveauState) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6 flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          Indique les niveaux proposés par l'établissement et le nombre de classes pour chacun (ex. 3e : 3 classes
          pour 3e1, 3e2, 3e3).
        </p>
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

      <div className="mb-4">
        <h3 className="mb-2 font-serif text-lg font-semibold text-foreground">Collège (6e - 3e)</h3>
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {COLLEGE_NIVEAUX.map((n) => (
            <NiveauRow
              key={n.key}
              label={n.label}
              state={form[n.key]}
              onChange={(value) => updateNiveau(n.key, value)}
            />
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-2 font-serif text-lg font-semibold text-foreground">Lycée (2nde - Tle)</h3>
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {LYCEE_NIVEAUX.map((n) => (
            <NiveauRow
              key={n.key}
              label={n.label}
              state={form[n.key]}
              onChange={(value) => updateNiveau(n.key, value)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
