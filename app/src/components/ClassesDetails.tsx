import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useProfile } from '@/hooks/useProfile'
import { EMPLOI_DU_TEMPS_QUERY_KEY, useEmploiDuTempsData } from '@/hooks/useEmploiDuTempsData'
import { Button } from '@/components/ui/button'

interface Detail {
  professeurPrincipal: string
  salleId: string
}

// Professeur principal (imprimé en tête de l'emploi du temps de la classe) et salle attitrée (où ont lieu
// les cours qui n'exigent pas de salle particulière) de chaque classe.
export function ClassesDetails() {
  const { data: profile } = useProfile()
  const etablissementId = profile?.etablissement_id ?? null
  const queryClient = useQueryClient()
  const { data } = useEmploiDuTempsData(etablissementId)
  const [details, setDetails] = useState<Record<string, Detail>>({})
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    if (hydrated || !data) return
    setDetails(
      Object.fromEntries(
        data.classesDetails.map((d) => [`${d.niveau}-${d.section}`, { professeurPrincipal: d.professeur_principal ?? '', salleId: d.salle_id ?? '' }]),
      ),
    )
    setHydrated(true)
  }, [data, hydrated])

  const saveMutation = useMutation({
    mutationFn: async () => {
      const rows = (data?.classeOptions ?? []).map((c) => ({
        etablissement_id: etablissementId!,
        niveau: c.niveau,
        section: c.section,
        professeur_principal: details[c.key]?.professeurPrincipal.trim() || null,
        salle_id: details[c.key]?.salleId || null,
        updated_at: new Date().toISOString(),
      }))
      if (rows.length === 0) return
      const { error } = await supabase.from('classes_details').upsert(rows, { onConflict: 'etablissement_id,niveau,section' })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [EMPLOI_DU_TEMPS_QUERY_KEY, etablissementId] }),
  })

  const nomsProfesseurs = [...new Set((data?.professeurs ?? []).map((p) => p.nom_complet))]
  const salles = data?.salles ?? []

  function update(key: string, patch: Partial<Detail>) {
    setDetails((current) => ({ ...current, [key]: { ...(current[key] ?? { professeurPrincipal: '', salleId: '' }), ...patch } }))
  }

  if (!data || data.classeOptions.length === 0) return null

  return (
    <div className="mt-10 max-w-3xl xl:mt-0">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="font-serif text-lg font-semibold text-foreground">Détail des classes</h3>
          <p className="text-sm text-muted-foreground">
            Professeur principal (imprimé en tête de l'emploi du temps) et salle attitrée (facultative) de chaque
            classe. Enregistre d'abord les niveaux ci-dessus si tu viens de les modifier.
          </p>
        </div>
        <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? 'Enregistrement...' : 'Enregistrer'}
        </Button>
      </div>
      {saveMutation.isSuccess && <p className="mb-3 text-sm text-primary">Enregistré.</p>}
      {saveMutation.isError && (
        <p className="mb-3 text-sm text-destructive">
          {saveMutation.error instanceof Error ? saveMutation.error.message : 'Échec de l’enregistrement.'}
        </p>
      )}

      <datalist id="professeurs-noms">
        {nomsProfesseurs.map((nom) => (
          <option key={nom} value={nom} />
        ))}
      </datalist>

      <div className="overflow-hidden rounded-xl border border-border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-secondary text-secondary-foreground">
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide">Classe</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide">Professeur principal</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide">Salle attitrée</th>
            </tr>
          </thead>
          <tbody>
            {data.classeOptions.map((c, i) => (
              <tr key={c.key} className={i % 2 === 0 ? 'border-t border-border bg-card' : 'border-t border-border bg-background'}>
                <td className="whitespace-nowrap px-3 py-1.5 font-medium">{c.label}</td>
                <td className="px-3 py-1.5">
                  <input
                    list="professeurs-noms"
                    value={details[c.key]?.professeurPrincipal ?? ''}
                    onChange={(e) => update(c.key, { professeurPrincipal: e.target.value })}
                    placeholder="—"
                    className="w-full rounded-md border border-border bg-card px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </td>
                <td className="px-3 py-1.5">
                  <select
                    value={details[c.key]?.salleId ?? ''}
                    onChange={(e) => update(c.key, { salleId: e.target.value })}
                    disabled={salles.length === 0}
                    className="w-full rounded-md border border-border bg-card px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="">{salles.length === 0 ? 'Aucune salle saisie' : 'Aucune'}</option>
                    {salles.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nom}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
