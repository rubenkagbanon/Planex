import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, RefreshCw } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { useEtablissement } from '@/hooks/useEtablissement'
import { anneeScolaireCourante } from '@/lib/anneeScolaire'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

// Champs imprimés en en-tête des emplois du temps (format des documents officiels du dossier /source).
const CHAMPS = [
  { key: 'name', label: "Nom de l'établissement", placeholder: 'COLLEGE LE CONQUERANT BINGERVILLE' },
  { key: 'ministere', label: 'Ministère', placeholder: "MINISTERE DE L'EDUCATION NATIONALE ET DE L'ALPHABETISATION" },
  { key: 'drena', label: 'Direction régionale (DRENA)', placeholder: 'DRENA ABIDJAN 1' },
  { key: 'code_etablissement', label: "Code de l'établissement", placeholder: '010907' },
  { key: 'statut', label: 'Statut', placeholder: 'Privé' },
  { key: 'adresse', label: 'Adresse / boîte postale', placeholder: 'BP 69 Bingerville' },
  { key: 'telephone', label: 'Téléphone', placeholder: '27 22 55 76 47 / 07 07 96 97 81' },
  { key: 'email', label: 'Email', placeholder: 'contact@etablissement.ci' },
  { key: 'annee_scolaire', label: 'Année scolaire', placeholder: anneeScolaireCourante() },
  { key: 'signataire_nom', label: 'Signataire des emplois du temps', placeholder: 'Sokodogo Adama' },
  { key: 'signataire_titre', label: 'Fonction du signataire', placeholder: 'Directeur des Études' },
] as const

type ChampKey = (typeof CHAMPS)[number]['key']

function formatCode(code: string): string {
  return code.length === 10 ? `${code.slice(0, 5)}-${code.slice(5)}` : code
}

export function EtablissementInfos() {
  const { user } = useAuth()
  const { etablissementId, etablissement, isAdmin } = useEtablissement()
  const queryClient = useQueryClient()
  const [form, setForm] = useState<Record<ChampKey, string>>(
    () => Object.fromEntries(CHAMPS.map((c) => [c.key, ''])) as Record<ChampKey, string>,
  )
  const [hydrated, setHydrated] = useState(false)
  const [copie, setCopie] = useState(false)

  useEffect(() => {
    if (hydrated || !etablissement) return
    setForm(Object.fromEntries(CHAMPS.map((c) => [c.key, (etablissement[c.key] as string | null) ?? ''])) as Record<ChampKey, string>)
    setHydrated(true)
  }, [etablissement, hydrated])

  const { data: membres } = useQuery({
    queryKey: ['membres', etablissementId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, full_name, role, created_at')
        .eq('etablissement_id', etablissementId!)
        .order('created_at')
      if (error) throw error
      return data
    },
    enabled: !!etablissementId,
  })

  const saveMutation = useMutation({
    mutationFn: async () => {
      const name = form.name.trim()
      if (!name) throw new Error("Le nom de l'établissement est obligatoire.")
      const patch = Object.fromEntries(CHAMPS.map((c) => [c.key, form[c.key].trim() || null])) as Partial<Record<ChampKey, string | null>>
      const { error } = await supabase
        .from('etablissements')
        .update({ ...patch, name })
        .eq('id', etablissementId!)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['etablissement', etablissementId] }),
  })

  const regenererMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('regenerer_code_invitation')
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['etablissement', etablissementId] }),
  })

  const membreMutation = useMutation({
    mutationFn: async (action: { type: 'retirer'; userId: string } | { type: 'role'; userId: string; role: 'admin' | 'membre' }) => {
      const { error } =
        action.type === 'retirer'
          ? await supabase.rpc('retirer_membre', { p_user_id: action.userId })
          : await supabase.rpc('definir_role_membre', { p_user_id: action.userId, p_role: action.role })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['membres', etablissementId] }),
  })

  async function copierCode() {
    if (!etablissement) return
    await navigator.clipboard.writeText(formatCode(etablissement.code_invitation))
    setCopie(true)
    setTimeout(() => setCopie(false), 1500)
  }

  return (
    <div className="flex max-w-5xl flex-col gap-8 lg:flex-row lg:items-start">
      <div className="flex-1 rounded-xl border border-border bg-card p-6">
        <div className="mb-2 flex items-center justify-between gap-4">
          <h3 className="font-serif text-lg font-semibold text-foreground">En-tête des documents</h3>
          {isAdmin && (
            <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
          )}
        </div>
        <p className="mb-5 text-sm text-muted-foreground">
          Ces informations apparaissent en tête de chaque emploi du temps imprimé ou exporté.
          {!isAdmin && ' Seul un administrateur peut les modifier.'}
        </p>
        {saveMutation.isSuccess && <p className="mb-4 text-sm text-primary">Enregistré.</p>}
        {saveMutation.isError && (
          <p className="mb-4 text-sm text-destructive">
            {saveMutation.error instanceof Error ? saveMutation.error.message : 'Échec de l’enregistrement.'}
          </p>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {CHAMPS.map((champ) => (
            <div key={champ.key} className={champ.key === 'name' || champ.key === 'ministere' ? 'flex flex-col gap-2 sm:col-span-2' : 'flex flex-col gap-2'}>
              <Label htmlFor={champ.key}>{champ.label}</Label>
              <Input
                id={champ.key}
                value={form[champ.key]}
                placeholder={champ.placeholder}
                disabled={!isAdmin}
                onChange={(e) => setForm((current) => ({ ...current, [champ.key]: e.target.value }))}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="flex w-full flex-col gap-6 lg:max-w-sm">
        <div className="rounded-xl border border-border bg-card p-6">
          <h3 className="mb-1 font-serif text-lg font-semibold text-foreground">Code d'invitation</h3>
          <p className="mb-4 text-sm text-muted-foreground">
            Un collègue qui crée son compte avec ce code rejoint automatiquement l'établissement. Personne ne peut
            le rejoindre sans lui.
          </p>
          {etablissement && (
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-center font-mono text-base font-semibold tracking-widest">
                {formatCode(etablissement.code_invitation)}
              </code>
              <Button type="button" variant="outline" size="sm" onClick={copierCode} aria-label="Copier le code">
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          )}
          {copie && <p className="mt-2 text-xs text-primary">Code copié.</p>}
          {isAdmin && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm("Générer un nouveau code ? L'ancien ne fonctionnera plus pour les nouvelles inscriptions.")) {
                  regenererMutation.mutate()
                }
              }}
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
            >
              <RefreshCw className="h-3 w-3" /> Générer un nouveau code
            </button>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card p-6">
          <h3 className="mb-3 font-serif text-lg font-semibold text-foreground">Membres ({membres?.length ?? 0})</h3>
          {membreMutation.isError && (
            <p className="mb-3 text-xs text-destructive">
              {membreMutation.error instanceof Error ? membreMutation.error.message : 'Action impossible.'}
            </p>
          )}
          <ul className="flex flex-col divide-y divide-border">
            {(membres ?? []).map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-foreground">
                    {m.full_name || m.email}
                    {m.id === user?.id && <span className="text-muted-foreground"> (toi)</span>}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {m.email} · {m.role === 'admin' ? 'Administrateur' : 'Membre'}
                  </div>
                </div>
                {isAdmin && m.id !== user?.id && (
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <button
                      type="button"
                      onClick={() => membreMutation.mutate({ type: 'role', userId: m.id, role: m.role === 'admin' ? 'membre' : 'admin' })}
                      className="text-xs font-semibold text-primary hover:underline"
                    >
                      {m.role === 'admin' ? 'Retirer admin' : 'Rendre admin'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(`Retirer ${m.full_name || m.email} de l'établissement ?`)) {
                          membreMutation.mutate({ type: 'retirer', userId: m.id })
                        }
                      }}
                      className="text-xs font-semibold text-destructive hover:underline"
                    >
                      Retirer
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
