import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useProfile } from '@/hooks/useProfile'
import { DISCIPLINES } from '@/lib/horairesReference'
import { TYPES_SALLE, type TypeSalle } from '@/lib/salles'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface SalleRow {
  key: string
  id?: string
  nom: string
  type: TypeSalle
  capacite: string
}

function newKey() {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`
}

const selectClass =
  'rounded-md border border-border bg-card px-2 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

export function Salles() {
  const { data: profile } = useProfile()
  const etablissementId = profile?.etablissement_id ?? null
  const queryClient = useQueryClient()
  const [rows, setRows] = useState<SalleRow[]>([])
  const [typesParMatiere, setTypesParMatiere] = useState<Record<string, string>>({})
  const [hydrated, setHydrated] = useState(false)

  const { data } = useQuery({
    queryKey: ['salles', etablissementId],
    queryFn: async () => {
      const [salles, matieres] = await Promise.all([
        supabase.from('salles').select('*').eq('etablissement_id', etablissementId!).order('nom'),
        supabase.from('matieres_salles').select('*').eq('etablissement_id', etablissementId!),
      ])
      if (salles.error) throw salles.error
      if (matieres.error) throw matieres.error
      return { salles: salles.data, matieres: matieres.data }
    },
    enabled: !!etablissementId,
  })

  useEffect(() => {
    if (hydrated || !data) return
    setRows(data.salles.map((s) => ({ key: newKey(), id: s.id, nom: s.nom, type: s.type as TypeSalle, capacite: String(s.capacite) })))
    setTypesParMatiere(Object.fromEntries(data.matieres.map((m) => [m.matiere, m.type_salle])))
    setHydrated(true)
  }, [data, hydrated])

  const saveMutation = useMutation({
    mutationFn: async () => {
      const id = etablissementId!
      const valides = rows.filter((r) => r.nom.trim())
      const noms = valides.map((r) => r.nom.trim().toLowerCase())
      if (new Set(noms).size !== noms.length) throw new Error('Deux salles portent le même nom.')

      // Mise à jour en place (pas de suppression/réinsertion) : les salles attitrées des classes et les
      // salles des séances déjà placées restent valides.
      const gardees = new Set(valides.filter((r) => r.id).map((r) => r.id!))
      const supprimees = (data?.salles ?? []).filter((s) => !gardees.has(s.id)).map((s) => s.id)
      if (supprimees.length > 0) {
        const { error } = await supabase.from('salles').delete().in('id', supprimees)
        if (error) throw error
      }
      for (const r of valides.filter((r) => r.id)) {
        const { error } = await supabase
          .from('salles')
          .update({ nom: r.nom.trim(), type: r.type, capacite: Math.max(1, parseInt(r.capacite, 10) || 1) })
          .eq('id', r.id!)
        if (error) throw error
      }
      const nouvelles = valides.filter((r) => !r.id)
      if (nouvelles.length > 0) {
        const { error } = await supabase.from('salles').insert(
          nouvelles.map((r) => ({ etablissement_id: id, nom: r.nom.trim(), type: r.type, capacite: Math.max(1, parseInt(r.capacite, 10) || 1) })),
        )
        if (error) throw error
      }

      const { error: deleteError } = await supabase.from('matieres_salles').delete().eq('etablissement_id', id)
      if (deleteError) throw deleteError
      const mapping = Object.entries(typesParMatiere).filter(([, type]) => type)
      if (mapping.length > 0) {
        const { error } = await supabase
          .from('matieres_salles')
          .insert(mapping.map(([matiere, type_salle]) => ({ etablissement_id: id, matiere, type_salle })))
        if (error) throw error
      }
    },
    onSuccess: () => {
      setHydrated(false)
      queryClient.invalidateQueries({ queryKey: ['salles', etablissementId] })
    },
  })

  function update(key: string, patch: Partial<SalleRow>) {
    setRows((current) => current.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }

  return (
    <div className="max-w-5xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="text-sm text-muted-foreground">
          <p>
            Les salles et lieux qui accueillent les cours. En règle générale une salle ne reçoit qu'une classe par
            créneau — sauf un <strong>tronc commun</strong> (plusieurs classes réunies pour le même cours) ou si sa
            capacité est plus grande (ex. un terrain où plusieurs classes font l'EPS en même temps). Inversement,
            une classe n'occupe qu'une salle à la fois, sauf en <strong>tandem</strong> (groupes en parallèle).
          </p>
          <p className="mt-2 rounded-lg border border-border bg-card px-3 py-2">
            Facultatif : sans aucune salle saisie, l'emploi du temps se génère normalement, simplement sans salle
            indiquée sur les séances.
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

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="flex-1 rounded-xl border border-border bg-card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-serif text-lg font-semibold">Salles ({rows.filter((r) => r.nom.trim()).length})</h3>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setRows((current) => [...current, { key: newKey(), nom: '', type: 'classe', capacite: '1' }])}
            >
              + Ajouter une salle
            </Button>
          </div>
          {rows.length === 0 && <p className="text-sm text-muted-foreground">Aucune salle saisie.</p>}
          {rows.length > 0 && (
            <div className="mb-1 grid grid-cols-[1fr_170px_90px_24px] gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <span>Nom</span>
              <span>Type</span>
              <span title="Nombre de classes accueillies en même temps">Capacité</span>
              <span />
            </div>
          )}
          <div className="flex flex-col gap-2">
            {rows.map((r) => (
              <div key={r.key} className="grid grid-cols-[1fr_170px_90px_24px] items-center gap-2">
                <Input value={r.nom} placeholder="S15, LABO1, INFO1..." onChange={(e) => update(r.key, { nom: e.target.value })} />
                <select value={r.type} onChange={(e) => update(r.key, { type: e.target.value as TypeSalle })} className={selectClass}>
                  {TYPES_SALLE.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <Input
                  type="number"
                  min={1}
                  value={r.capacite}
                  onChange={(e) => update(r.key, { capacite: e.target.value })}
                  title="Nombre de classes accueillies en même temps"
                />
                <button
                  type="button"
                  onClick={() => setRows((current) => current.filter((x) => x.key !== r.key))}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label="Supprimer cette salle"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="w-full rounded-xl border border-border bg-card p-5 lg:max-w-sm">
          <h3 className="mb-1 font-serif text-lg font-semibold">Salle exigée par matière</h3>
          <p className="mb-4 text-xs text-muted-foreground">
            Ex. S.V.T. et Physique-Chimie en laboratoire, TICE en salle informatique. Les autres matières ont lieu
            dans la salle attitrée de la classe (Paramètres &gt; Classes), si elle en a une.
          </p>
          <div className="flex flex-col gap-2">
            {DISCIPLINES.map((matiere) => (
              <div key={matiere} className="flex items-center justify-between gap-3">
                <span className="text-sm text-foreground">{matiere}</span>
                <select
                  value={typesParMatiere[matiere] ?? ''}
                  onChange={(e) => setTypesParMatiere((current) => ({ ...current, [matiere]: e.target.value }))}
                  className={selectClass}
                >
                  <option value="">Salle de la classe</option>
                  {TYPES_SALLE.filter((t) => t.key !== 'classe').map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
