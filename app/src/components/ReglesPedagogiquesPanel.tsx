import { useEffect, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { DISCIPLINES } from '@/lib/horairesReference'
import { lireRegles, REGLES_DESCRIPTIONS, type ReglesPedagogiques } from '@/lib/regles'
import type { Json } from '@/lib/database.types'
import { cn } from '@/lib/utils'

type Cycle = 'college' | 'lycee'

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

const NATURE_LABEL = { souple: 'À éviter', stricte: 'Prioritaire', contrôle: 'Contrôle' } as const

// Règles pédagogiques activables et personnalisables, enregistrées immédiatement (comme les autres
// contraintes pédagogiques) dans `horaires_contraintes.regles` pour chaque cycle du formulaire.
// `enTete` : contraintes pédagogiques du formulaire (mercredi après-midi, 1 créneau = 1 heure, couleurs),
// affichées en premier dans la liste des règles.
export function ReglesPedagogiquesPanel({
  etablissementId,
  cycles,
  enTete,
}: {
  etablissementId: string
  cycles: Cycle[]
  enTete?: ReactNode
}) {
  const queryClient = useQueryClient()
  const cyclesKey = [...cycles].sort().join(',')
  const [regles, setRegles] = useState<ReglesPedagogiques | null>(null)

  const { data: rows } = useQuery({
    queryKey: ['horaires_contraintes_regles', etablissementId, cyclesKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('horaires_contraintes')
        .select('cycle, regles')
        .eq('etablissement_id', etablissementId)
        .in('cycle', cycles)
      if (error) throw error
      return data
    },
  })

  useEffect(() => {
    if (rows) setRegles(lireRegles(rows[0]?.regles))
  }, [rows])

  const saveMutation = useMutation({
    mutationFn: async (next: ReglesPedagogiques) => {
      const { error } = await supabase
        .from('horaires_contraintes')
        .update({ regles: next as unknown as Json })
        .eq('etablissement_id', etablissementId)
        .in('cycle', cycles)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['horaires_contraintes_regles', etablissementId, cyclesKey] }),
  })

  function patch<K extends keyof ReglesPedagogiques>(key: K, value: Partial<ReglesPedagogiques[K]>) {
    if (!regles) return
    const next = { ...regles, [key]: { ...regles[key], ...value } }
    setRegles(next)
    saveMutation.mutate(next)
  }

  if (!rows) return null
  if (rows.length === 0) {
    return (
      <div className="mb-10 rounded-xl border border-border bg-card">
        {enTete}
        <div className="border-t border-border p-6 text-sm text-muted-foreground">
          Enregistre d'abord les jours et créneaux ci-dessus pour régler les autres règles pédagogiques de ce cycle.
        </div>
      </div>
    )
  }
  if (!regles) return null

  function ChipsMatieres({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
    return (
      <div className="mt-2 flex flex-wrap gap-1.5">
        {DISCIPLINES.map((d) => {
          const active = value.includes(d)
          return (
            <button
              key={d}
              type="button"
              onClick={() => onChange(active ? value.filter((m) => m !== d) : [...value, d])}
              className={cn(
                'rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors',
                active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-muted-foreground hover:text-foreground',
              )}
            >
              {d}
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <div className="mb-10 rounded-xl border border-border bg-card">
      <div className="px-6 pb-2 pt-6">
        <h3 className="font-serif text-lg font-semibold text-foreground">Règles pédagogiques</h3>
        <p className="text-sm text-muted-foreground">
          Activables une par une. « À éviter » : respectée en priorité, relâchée seulement en dernier recours (et
          signalée dans le rapport de génération). « Prioritaire » : relâchée seulement si, sans cela, des heures de la grille horaire seraient perdues. La grille horaire de référence passe avant toutes les règles.
        </p>
        {saveMutation.isError && (
          <p className="mt-2 text-xs text-destructive">
            {saveMutation.error instanceof Error ? saveMutation.error.message : 'Échec de l’enregistrement.'}
          </p>
        )}
      </div>
      {enTete}
      {REGLES_DESCRIPTIONS.map((regle) => {
        const config = regles[regle.key] as { actif: boolean }
        return (
          <div key={regle.key} className="flex items-start justify-between gap-6 border-t border-border px-6 py-4">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-foreground">{regle.titre}</span>
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                    regle.nature === 'stricte' ? 'bg-secondary text-secondary-foreground' : 'bg-muted text-foreground',
                  )}
                >
                  {NATURE_LABEL[regle.nature]}
                </span>
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">{regle.description}</div>

              {config.actif && regle.key === 'pasEnchainerLangues' && (
                <ChipsMatieres value={regles.pasEnchainerLangues.matieres} onChange={(matieres) => patch('pasEnchainerLangues', { matieres })} />
              )}
              {config.actif && regle.key === 'pasEnchainerSciences' && (
                <ChipsMatieres value={regles.pasEnchainerSciences.matieres} onChange={(matieres) => patch('pasEnchainerSciences', { matieres })} />
              )}
              {config.actif && regle.key === 'eviterCoupurePause' && (
                <label className="mt-2 flex items-center gap-2 text-xs text-foreground">
                  <input
                    type="checkbox"
                    checked={regles.eviterCoupurePause.autoriserException}
                    onChange={(e) => patch('eviterCoupurePause', { autoriserException: e.target.checked })}
                  />
                  Autoriser exceptionnellement si aucun autre placement n'est possible
                </label>
              )}
              {config.actif && regle.key === 'minDisciplinesParJour' && (
                <label className="mt-2 flex items-center gap-2 text-xs text-foreground">
                  Minimum
                  <input
                    type="number"
                    min={1}
                    max={8}
                    defaultValue={regles.minDisciplinesParJour.minimum}
                    onBlur={(e) => patch('minDisciplinesParJour', { minimum: Math.min(8, Math.max(1, parseInt(e.target.value, 10) || 3)) })}
                    className="w-14 rounded-md border border-border bg-card px-2 py-1 text-center text-sm"
                  />
                  disciplines différentes par jour
                </label>
              )}
            </div>
            <Toggle checked={config.actif} onChange={(actif) => patch(regle.key, { actif } as never)} />
          </div>
        )
      })}
    </div>
  )
}
