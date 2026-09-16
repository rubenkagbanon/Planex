import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Clock, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useProfile } from '@/hooks/useProfile'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { JOURS_SEMAINE } from '@/lib/joursSemaine'
import { cn } from '@/lib/utils'

type Cycle = 'college' | 'lycee'
type CreneauType = 'cours' | 'recreation' | 'dejeuner'

const CYCLES: { key: Cycle; label: string }[] = [
  { key: 'college', label: 'Collège (6e - 3e)' },
  { key: 'lycee', label: 'Lycée (2nde - Tle)' },
]

const CRENEAU_TYPES: { key: CreneauType; label: string }[] = [
  { key: 'cours', label: 'Cours' },
  { key: 'recreation', label: 'Récréation' },
  { key: 'dejeuner', label: 'Déjeuner' },
]

interface CreneauRow {
  key: string
  heureDebut: string
  heureFin: string
  type: CreneauType
}

interface ContraintesForm {
  joursCours: string[]
  creneaux: CreneauRow[]
  mercrediApresMidiBanalise: boolean
  creneauEgaleHeure: boolean
  couleurMatieres: boolean
}

function newCreneauKey() {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`
}

const EMPTY_FORM: ContraintesForm = {
  joursCours: ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi'],
  creneaux: [],
  mercrediApresMidiBanalise: false,
  creneauEgaleHeure: true,
  couleurMatieres: false,
}

// Convertit "18h", "18h30", "18:30", "18" en "HH:MM" (24h). Retourne null si invalide.
function parseHeureFr(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase()
  if (!trimmed) return null
  const match = trimmed.match(/^(\d{1,2})\s*(?:[h:]\s*(\d{1,2})?)?$/)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = match[2] ? Number(match[2]) : 0
  if (hours > 23 || minutes > 59) return null
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

// "18:30" → "18h30", "18:00" → "18h"
function formatHeureFr(hhmm: string): string {
  if (!hhmm) return ''
  const [h, m] = hhmm.split(':')
  const hours = Number(h)
  const minutes = Number(m)
  return minutes === 0 ? `${hours}h` : `${hours}h${String(minutes).padStart(2, '0')}`
}

function TimeField({
  label,
  value,
  onChange,
  placeholder = '18h30',
}: {
  label?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
}) {
  const [text, setText] = useState(() => formatHeureFr(value))
  const [focused, setFocused] = useState(false)
  const pickerRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!focused) setText(formatHeureFr(value))
  }, [value, focused])

  function handleBlur() {
    setFocused(false)
    const parsed = parseHeureFr(text)
    if (parsed !== null) {
      onChange(parsed)
      setText(formatHeureFr(parsed))
    } else if (text.trim() === '') {
      onChange('')
      setText('')
    } else {
      setText(formatHeureFr(value))
    }
  }

  function openPicker() {
    const picker = pickerRef.current
    if (!picker) return
    if (typeof picker.showPicker === 'function') {
      picker.showPicker()
    } else {
      picker.focus()
      picker.click()
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {label && <Label>{label}</Label>}
      <div className="relative">
        <button
          type="button"
          onClick={openPicker}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          aria-label={label ? `Choisir l'heure — ${label}` : "Choisir l'heure"}
        >
          <Clock className="h-4 w-4" />
        </button>
        <input
          type="text"
          inputMode="numeric"
          placeholder={placeholder}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={handleBlur}
          className="w-full rounded-md border border-border bg-card py-2 pl-9 pr-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <input
          ref={pickerRef}
          type="time"
          value={value}
          onChange={(e) => {
            onChange(e.target.value)
            setText(formatHeureFr(e.target.value))
          }}
          tabIndex={-1}
          aria-hidden="true"
          className="sr-only"
        />
      </div>
    </div>
  )
}

function ConstraintToggle({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) {
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

const CRENEAU_TYPE_LABEL: Record<CreneauType, string> = {
  cours: '',
  recreation: 'RÉCRÉATION',
  dejeuner: 'DÉJEUNER',
}

// 50 → "50min", 60 → "1h", 90 → "1h30"
function formatDureeMinutes(minutes: number): string {
  if (minutes <= 0) return ''
  if (minutes % 60 === 0) return `${minutes / 60}h`
  if (minutes >= 60) return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}`
  return `${minutes}min`
}

// "07:45" / "08:35" → "50min", "13:15" / "14:15" → "1h"
function formatDuree(heureDebut: string, heureFin: string): string {
  const [dh, dm] = heureDebut.split(':').map(Number)
  const [fh, fm] = heureFin.split(':').map(Number)
  return formatDureeMinutes(fh * 60 + fm - (dh * 60 + dm))
}

// Durée type d'une séance de cours dans ce formulaire : la durée la plus fréquente parmi les créneaux de
// type "cours" déjà saisis (fallback 60 min si aucun n'est configuré) — c'est la valeur affichée dans le
// réglage "1 créneau = 1 heure de cours" pour que le texte reflète les vrais créneaux de l'établissement.
function dureeTypeSeance(creneaux: CreneauRow[]): number {
  const cours = creneaux.filter((c) => c.type === 'cours' && c.heureDebut && c.heureFin)
  const counts = new Map<number, number>()
  for (const c of cours) {
    const [dh, dm] = c.heureDebut.split(':').map(Number)
    const [fh, fm] = c.heureFin.split(':').map(Number)
    const duree = fh * 60 + fm - (dh * 60 + dm)
    if (duree > 0) counts.set(duree, (counts.get(duree) ?? 0) + 1)
  }
  let best = 60
  let bestCount = 0
  for (const [duree, count] of counts) {
    if (count > bestCount || (count === bestCount && duree < best)) {
      best = duree
      bestCount = count
    }
  }
  return best
}

// Aperçu en direct de la grille (jours × créneaux), sans données de cours pour l'instant —
// se met à jour au fil de la saisie, façon capture d'emploi du temps fourni en référence.
function EmploiDuTempsApercu({
  joursCours,
  creneaux,
  mercrediApresMidiBanalise,
}: {
  joursCours: string[]
  creneaux: CreneauRow[]
  mercrediApresMidiBanalise: boolean
}) {
  const jours = JOURS_SEMAINE.filter((j) => joursCours.includes(j.key))
  const sorted = [...creneaux]
    .filter((c) => c.heureDebut && c.heureFin)
    .sort((a, b) => a.heureDebut.localeCompare(b.heureDebut))
  const heureDejeuner = sorted.find((c) => c.type === 'dejeuner')?.heureDebut

  return (
    <div className="mb-10 rounded-xl border border-border bg-card p-6">
      <h3 className="mb-1 text-base font-semibold text-foreground">Aperçu de l'emploi du temps</h3>
      <p className="mb-4 text-sm text-muted-foreground">
        Structure de la grille à partir des jours et créneaux ci-dessus — les cours viendront s'y placer à l'étape
        suivante.
      </p>

      {jours.length === 0 || sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Sélectionne des jours de cours et ajoute des créneaux pour voir l'aperçu.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[640px] table-fixed border-collapse text-sm">
            <thead>
              <tr className="bg-secondary text-secondary-foreground">
                <th className="w-28 whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide">
                  Horaires
                </th>
                {jours.map((j) => (
                  <th key={j.key} className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide">
                    {j.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((c) => {
                const isBreak = c.type !== 'cours'
                return (
                  <tr key={c.key} className="border-t border-border">
                    <td className="whitespace-nowrap px-3 py-2 text-xs font-medium text-muted-foreground">
                      {formatHeureFr(c.heureDebut)} - {formatHeureFr(c.heureFin)}
                    </td>
                    {isBreak ? (
                      <td
                        colSpan={jours.length}
                        className="bg-muted/50 px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                      >
                        {CRENEAU_TYPE_LABEL[c.type]}
                      </td>
                    ) : (
                      jours.map((j) => {
                        const banalise =
                          j.key === 'mercredi' &&
                          mercrediApresMidiBanalise &&
                          !!heureDejeuner &&
                          c.heureDebut > heureDejeuner
                        return (
                          <td
                            key={j.key}
                            className="border-l border-border px-3 py-4 text-center text-xs text-muted-foreground/40"
                          >
                            {banalise ? '—' : formatDuree(c.heureDebut, c.heureFin)}
                          </td>
                        )
                      })
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// Un même formulaire peut s'appliquer à un seul cycle, ou aux deux à la fois
// (dans ce cas l'enregistrement écrit la même grille horaire pour chaque cycle sélectionné).
function ScheduleForm({ etablissementId, cycles, label }: { etablissementId: string; cycles: Cycle[]; label: string }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<ContraintesForm>(EMPTY_FORM)
  const [hydrated, setHydrated] = useState(false)
  const cyclesKey = [...cycles].sort().join(',')

  const { data: existingContraintes } = useQuery({
    queryKey: ['horaires_contraintes', etablissementId, cyclesKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('horaires_contraintes')
        .select('*')
        .eq('etablissement_id', etablissementId)
        .in('cycle', cycles)
      if (error) throw error
      return data
    },
  })

  const { data: existingCreneaux } = useQuery({
    queryKey: ['creneaux_horaires', etablissementId, cyclesKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('creneaux_horaires')
        .select('*')
        .eq('etablissement_id', etablissementId)
        .in('cycle', cycles)
        .order('heure_debut', { ascending: true })
      if (error) throw error
      return data
    },
  })

  useEffect(() => {
    setHydrated(false)
  }, [cyclesKey])

  useEffect(() => {
    if (hydrated || !existingContraintes || !existingCreneaux) return
    const existingRow = existingContraintes[0]
    const creneauxForCycle = existingCreneaux.filter((row) => row.cycle === cycles[0])
    setForm({
      joursCours: existingRow?.jours_cours ?? EMPTY_FORM.joursCours,
      mercrediApresMidiBanalise: existingRow?.mercredi_apres_midi_banalise ?? false,
      creneauEgaleHeure: existingRow?.creneau_egale_heure ?? true,
      couleurMatieres: existingRow?.couleur_matieres ?? false,
      creneaux: creneauxForCycle.map((row) => ({
        key: newCreneauKey(),
        heureDebut: row.heure_debut.slice(0, 5),
        heureFin: row.heure_fin.slice(0, 5),
        type: row.type as CreneauType,
      })),
    })
    setHydrated(true)
  }, [existingContraintes, existingCreneaux, hydrated, cycles])

  const saveMutation = useMutation({
    mutationFn: async () => {
      const contraintesRows = cycles.map((cycle) => ({
        etablissement_id: etablissementId,
        cycle,
        jours_cours: form.joursCours,
        mercredi_apres_midi_banalise: form.mercrediApresMidiBanalise,
        creneau_egale_heure: form.creneauEgaleHeure,
        couleur_matieres: form.couleurMatieres,
      }))
      const { error: contraintesError } = await supabase
        .from('horaires_contraintes')
        .upsert(contraintesRows, { onConflict: 'etablissement_id,cycle' })
      if (contraintesError) throw contraintesError

      const { error: deleteError } = await supabase
        .from('creneaux_horaires')
        .delete()
        .eq('etablissement_id', etablissementId)
        .in('cycle', cycles)
      if (deleteError) throw deleteError

      const validCreneaux = form.creneaux.filter((c) => c.heureDebut && c.heureFin)
      if (validCreneaux.length > 0) {
        const creneauxRows = cycles.flatMap((cycle) =>
          validCreneaux.map((c) => ({
            etablissement_id: etablissementId,
            cycle,
            heure_debut: c.heureDebut,
            heure_fin: c.heureFin,
            type: c.type,
          })),
        )
        const { error: insertError } = await supabase.from('creneaux_horaires').insert(creneauxRows)
        if (insertError) throw insertError
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['horaires_contraintes', etablissementId, cyclesKey] })
      queryClient.invalidateQueries({ queryKey: ['creneaux_horaires', etablissementId, cyclesKey] })
    },
  })

  // Les bulles de "Contraintes pédagogiques" s'enregistrent immédiatement au clic, sans attendre le
  // bouton "Enregistrer" (qui ne concerne que les jours/créneaux).
  const toggleMutation = useMutation({
    mutationFn: async (
      patch: Partial<Pick<ContraintesForm, 'mercrediApresMidiBanalise' | 'creneauEgaleHeure' | 'couleurMatieres'>>,
    ) => {
      const nextForm = { ...form, ...patch }
      const contraintesRows = cycles.map((cycle) => ({
        etablissement_id: etablissementId,
        cycle,
        jours_cours: nextForm.joursCours,
        mercredi_apres_midi_banalise: nextForm.mercrediApresMidiBanalise,
        creneau_egale_heure: nextForm.creneauEgaleHeure,
        couleur_matieres: nextForm.couleurMatieres,
      }))
      const { error } = await supabase
        .from('horaires_contraintes')
        .upsert(contraintesRows, { onConflict: 'etablissement_id,cycle' })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['horaires_contraintes', etablissementId, cyclesKey] })
    },
  })

  function toggleImmediate(key: 'mercrediApresMidiBanalise' | 'creneauEgaleHeure' | 'couleurMatieres', value: boolean) {
    set(key, value)
    toggleMutation.mutate({ [key]: value })
  }

  function toggleJour(jourKey: string) {
    setForm((current) => ({
      ...current,
      joursCours: current.joursCours.includes(jourKey)
        ? current.joursCours.filter((j) => j !== jourKey)
        : [...current.joursCours, jourKey],
    }))
  }

  function set<K extends keyof ContraintesForm>(key: K, value: ContraintesForm[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function addCreneau() {
    setForm((current) => {
      const previous = current.creneaux[current.creneaux.length - 1]
      const heureDebut = previous?.heureFin || ''
      return {
        ...current,
        creneaux: [...current.creneaux, { key: newCreneauKey(), heureDebut, heureFin: '', type: 'cours' }],
      }
    })
  }

  function updateCreneau(key: string, patch: Partial<Omit<CreneauRow, 'key'>>) {
    setForm((current) => ({
      ...current,
      creneaux: current.creneaux.map((c) => (c.key === key ? { ...c, ...patch } : c)),
    }))
  }

  function removeCreneau(key: string) {
    setForm((current) => ({ ...current, creneaux: current.creneaux.filter((c) => c.key !== key) }))
  }

  return (
    <>
    <div className="mb-10 flex flex-col gap-6 lg:flex-row lg:items-start">
    <div className="max-w-2xl flex-1 rounded-xl border border-border bg-card p-6">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h3 className="text-base font-semibold text-foreground">{label}</h3>
        <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? 'Enregistrement...' : 'Enregistrer'}
        </Button>
      </div>

      {saveMutation.isSuccess && <p className="mb-4 text-sm text-primary">Enregistré.</p>}
      {saveMutation.isError && (
        <p className="mb-4 text-sm text-destructive">
          {saveMutation.error instanceof Error ? saveMutation.error.message : 'Échec de l’enregistrement.'}
        </p>
      )}

      <div className="mb-8">
        <Label className="mb-3 block">Jours de cours</Label>
        <div className="flex flex-wrap gap-2">
          {JOURS_SEMAINE.map((jour) => {
            const active = form.joursCours.includes(jour.key)
            return (
              <button
                key={jour.key}
                type="button"
                onClick={() => toggleJour(jour.key)}
                className={cn(
                  'rounded-full border px-4 py-1.5 text-sm font-medium transition-colors',
                  active
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background text-muted-foreground hover:text-foreground',
                )}
              >
                {jour.label}
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <Label className="block">Créneaux horaires</Label>
          <Button type="button" variant="outline" size="sm" onClick={addCreneau}>
            + Ajouter un créneau
          </Button>
        </div>

        {form.creneaux.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Aucun créneau défini. Ajoute chaque période de la journée (cours, récréation, déjeuner) dans l'ordre.
          </p>
        )}

        <div className="flex flex-col gap-2">
          {form.creneaux.map((creneau, i) => (
            <div key={creneau.key} className="flex items-end gap-2">
              <TimeField
                label={i === 0 ? 'Début' : undefined}
                value={creneau.heureDebut}
                onChange={(v) => updateCreneau(creneau.key, { heureDebut: v })}
                placeholder="7h45"
              />
              <TimeField
                label={i === 0 ? 'Fin' : undefined}
                value={creneau.heureFin}
                onChange={(v) => updateCreneau(creneau.key, { heureFin: v })}
                placeholder="8h35"
              />
              <div className="flex flex-col gap-2">
                {i === 0 && <Label>Type</Label>}
                <select
                  value={creneau.type}
                  onChange={(e) => updateCreneau(creneau.key, { type: e.target.value as CreneauType })}
                  className="rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {CRENEAU_TYPES.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={() => removeCreneau(creneau.key)}
                className="mb-2 text-muted-foreground hover:text-destructive"
                aria-label="Supprimer ce créneau"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>

    <div className="w-full max-w-xs shrink-0 overflow-hidden rounded-xl border border-border bg-card">
      <h3 className="px-6 pt-6 pb-4 font-serif text-lg font-semibold text-foreground">Contraintes pédagogiques</h3>
      <div className="flex items-center justify-between gap-6 border-t border-border px-5 py-4">
        <div>
          <div className="text-sm font-semibold text-foreground">Mercredi après-midi banalisé</div>
          <div className="mt-0.5 text-xs text-muted-foreground">Aucun cours — Vie scolaire uniquement.</div>
        </div>
        <ConstraintToggle
          checked={form.mercrediApresMidiBanalise}
          onChange={(v) => toggleImmediate('mercrediApresMidiBanalise', v)}
        />
      </div>
      <div className="flex items-center justify-between gap-6 border-t border-border px-5 py-4">
        <div>
          <div className="text-sm font-semibold text-foreground">1 créneau = 1 heure de cours</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            Prend un créneau (dans notre cas {formatDureeMinutes(dureeTypeSeance(form.creneaux))}) pour une
            séance d'une heure et calcule le nombre d'heures de cours par semaine sur ce principe. Décoché,
            le calcul utilise vraiment la durée réelle des créneaux.
          </div>
        </div>
        <ConstraintToggle
          checked={form.creneauEgaleHeure}
          onChange={(v) => toggleImmediate('creneauEgaleHeure', v)}
        />
      </div>
      <div className="flex items-center justify-between gap-6 border-t border-border px-5 py-4">
        <div>
          <div className="text-sm font-semibold text-foreground">Colorer les matières</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            Sur le planning (/planning), chaque matière a sa couleur — pour repérer d'un coup d'œil les
            cases qui portent la même matière.
          </div>
        </div>
        <ConstraintToggle
          checked={form.couleurMatieres}
          onChange={(v) => toggleImmediate('couleurMatieres', v)}
        />
      </div>
      {toggleMutation.isError && (
        <p className="px-5 pb-4 text-xs text-destructive">
          {toggleMutation.error instanceof Error ? toggleMutation.error.message : 'Échec de l’enregistrement.'}
        </p>
      )}
    </div>
    </div>

    <EmploiDuTempsApercu
      joursCours={form.joursCours}
      creneaux={form.creneaux}
      mercrediApresMidiBanalise={form.mercrediApresMidiBanalise}
    />
    </>
  )
}

export function HorairesContraintes() {
  const { data: profile } = useProfile()
  const etablissementId = profile?.etablissement_id ?? null
  const [activeCycles, setActiveCycles] = useState<Set<Cycle>>(new Set())
  const [initialized, setInitialized] = useState(false)

  const { data: existingCycles } = useQuery({
    queryKey: ['horaires_contraintes_cycles', etablissementId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('horaires_contraintes')
        .select('cycle')
        .eq('etablissement_id', etablissementId!)
      if (error) throw error
      return data.map((row) => row.cycle as Cycle)
    },
    enabled: !!etablissementId,
  })

  useEffect(() => {
    if (initialized || !existingCycles) return
    if (existingCycles.length > 0) {
      setActiveCycles(new Set(existingCycles))
    }
    setInitialized(true)
  }, [existingCycles, initialized])

  function toggleCycle(cycle: Cycle) {
    setActiveCycles((current) => {
      const next = new Set(current)
      if (next.has(cycle)) next.delete(cycle)
      else next.add(cycle)
      return next
    })
  }

  const selectedCycles = CYCLES.filter((cycle) => activeCycles.has(cycle.key)).map((cycle) => cycle.key)
  const formLabel =
    selectedCycles.length === 2
      ? 'Collège & Lycée (mêmes horaires pour tout l’établissement)'
      : CYCLES.find((cycle) => cycle.key === selectedCycles[0])?.label

  return (
    <div>
      <p className="mb-4 text-sm text-muted-foreground">
        L'établissement peut avoir un collège, un lycée, ou les deux. Si les deux sont sélectionnés, un seul jeu
        d'horaires s'applique à tout l'établissement ; sinon chaque cycle a ses propres horaires.
      </p>

      <div className="mb-8 flex flex-wrap gap-2">
        {CYCLES.map((cycle) => {
          const active = activeCycles.has(cycle.key)
          return (
            <button
              key={cycle.key}
              type="button"
              onClick={() => toggleCycle(cycle.key)}
              className={cn(
                'rounded-full border px-4 py-1.5 text-sm font-medium transition-colors',
                active
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card text-muted-foreground hover:text-foreground',
              )}
            >
              {cycle.label}
            </button>
          )
        })}
      </div>

      {etablissementId && selectedCycles.length > 0 && (
        <ScheduleForm etablissementId={etablissementId} cycles={selectedCycles} label={formLabel!} />
      )}

      {activeCycles.size === 0 && (
        <p className="text-sm text-muted-foreground">Sélectionne au moins un cycle pour définir ses horaires.</p>
      )}
    </div>
  )
}
