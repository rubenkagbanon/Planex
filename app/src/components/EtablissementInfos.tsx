import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, ImageIcon, RefreshCw, Trash2, Upload } from 'lucide-react'
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
        <LogoEtablissement etablissementId={etablissementId} logo={etablissement?.logo ?? null} isAdmin={isAdmin} />
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

        {isAdmin && <SuppressionDonnees nomEtablissement={etablissement?.name ?? ''} />}
      </div>
    </div>
  )
}

// Réduit l'image (300 px au plus grand côté) et la convertit en data URL : PNG pour garder la transparence
// d'un tampon détouré, JPEG sinon (plus léger).
async function preparerLogo(fichier: File): Promise<string> {
  if (!/^image\/(png|jpeg)$/.test(fichier.type)) throw new Error('Choisis une image PNG ou JPG.')
  const url = URL.createObjectURL(fichier)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('Image illisible.'))
      img.src = url
    })
    const echelle = Math.min(1, 300 / Math.max(image.naturalWidth, image.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.naturalWidth * echelle))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * echelle))
    canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height)
    return fichier.type === 'image/png' ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.9)
  } finally {
    URL.revokeObjectURL(url)
  }
}

function LogoEtablissement({ etablissementId, logo, isAdmin }: { etablissementId: string | null; logo: string | null; isAdmin: boolean }) {
  const queryClient = useQueryClient()
  const enregistrer = useMutation({
    mutationFn: async (valeur: string | null) => {
      const { error } = await supabase.from('etablissements').update({ logo: valeur }).eq('id', etablissementId!)
      if (error) {
        if (/logo/i.test(error.message) && /column|schema cache|permission/i.test(error.message)) {
          throw new Error('Applique d’abord la migration 20261006120000_logo_etablissement.sql dans l’éditeur SQL de Supabase.')
        }
        throw error
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['etablissement', etablissementId] }),
  })
  const [erreur, setErreur] = useState<string | null>(null)

  async function choisir(fichier: File | undefined) {
    if (!fichier) return
    setErreur(null)
    try {
      enregistrer.mutate(await preparerLogo(fichier))
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Image illisible.')
    }
  }

  const message = erreur ?? (enregistrer.error instanceof Error ? enregistrer.error.message : null)

  return (
    <div className="mb-5 flex items-center gap-4 rounded-lg border border-border bg-background p-4">
      <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border border-dashed border-border bg-card">
        {logo ? <img src={logo} alt="Logo de l'établissement" className="max-h-full max-w-full object-contain" /> : <ImageIcon className="h-6 w-6 text-muted-foreground" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-foreground">Logo de l'établissement</div>
        <p className="text-xs text-muted-foreground">Imprimé sous la DRENA, au-dessus du nom. PNG ou JPG.</p>
        {isAdmin && (
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-primary hover:underline">
              <Upload className="h-3 w-3" />
              {enregistrer.isPending ? 'Envoi…' : logo ? 'Changer le logo' : 'Ajouter un logo'}
              <input
                type="file"
                accept="image/png,image/jpeg"
                className="hidden"
                disabled={enregistrer.isPending}
                onChange={(e) => {
                  void choisir(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
            </label>
            {logo && (
              <button type="button" onClick={() => enregistrer.mutate(null)} className="text-xs font-semibold text-destructive hover:underline">
                Retirer
              </button>
            )}
          </div>
        )}
        {message && <p className="mt-1 text-xs text-destructive">{message}</p>}
      </div>
    </div>
  )
}

// Zone sensible : suppression de toutes les données créées pour l'établissement (paramétrage, emploi du
// temps, versions, rapports, et la bibliothèque si cochée). L'établissement et les comptes restent.
function SuppressionDonnees({ nomEtablissement }: { nomEtablissement: string }) {
  const queryClient = useQueryClient()
  const [ouvert, setOuvert] = useState(false)
  const [avecBibliotheque, setAvecBibliotheque] = useState(false)
  const [saisie, setSaisie] = useState('')
  const [fait, setFait] = useState(false)

  const supprimer = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('supprimer_donnees_etablissement', { p_avec_bibliotheque: avecBibliotheque })
      if (error) {
        if (/could not find the function|does not exist/i.test(error.message)) {
          throw new Error('Applique d’abord la migration 20261004120000_succession_administrateur.sql dans l’éditeur SQL de Supabase.')
        }
        throw error
      }
    },
    onSuccess: () => {
      setFait(true)
      setOuvert(false)
      setSaisie('')
      queryClient.invalidateQueries()
    },
  })

  const confirme = saisie.trim().toLocaleLowerCase('fr-FR') === nomEtablissement.trim().toLocaleLowerCase('fr-FR') && nomEtablissement.trim() !== ''

  return (
    <div className="rounded-xl border border-destructive/40 bg-card p-6">
      <h3 className="mb-1 font-serif text-lg font-semibold text-destructive">Zone sensible</h3>
      <p className="mb-4 text-sm text-muted-foreground">
        Supprime toutes les données créées pour l’établissement, pour repartir de zéro. L’en-tête, le code d’invitation et les
        comptes des membres sont conservés.
      </p>
      {fait && <p className="mb-3 text-sm text-primary">Toutes les données ont été supprimées.</p>}
      {!ouvert ? (
        <Button variant="outline" className="w-full border-destructive/50 text-destructive hover:bg-destructive/10" onClick={() => setOuvert(true)}>
          <Trash2 className="mr-1.5 h-4 w-4" /> Supprimer toutes les données
        </Button>
      ) : (
        <div className="space-y-3 text-sm">
          <div className="rounded-md bg-destructive/5 p-3 text-xs text-foreground">
            <p className="mb-1 font-semibold text-destructive">Seront supprimés définitivement :</p>
            classes et détail des classes, professeurs et indisponibilités, salles, créneaux, jours et règles pédagogiques, grille
            horaire personnalisée, regroupements, emploi du temps, versions et rapports de génération.
          </div>
          <label className="flex items-start gap-2 text-xs">
            <input type="checkbox" className="mt-0.5" checked={avecBibliotheque} onChange={(e) => setAvecBibliotheque(e.target.checked)} />
            Supprimer aussi la Bibliothèque des années (années archivées)
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span>
              Pour confirmer, tape le nom de l’établissement : <strong className="text-foreground">{nomEtablissement}</strong>
            </span>
            <Input value={saisie} onChange={(e) => setSaisie(e.target.value)} placeholder={nomEtablissement} />
          </label>
          <div className="flex gap-2">
            <Button className="flex-1 bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={!confirme || supprimer.isPending} onClick={() => supprimer.mutate()}>
              {supprimer.isPending ? 'Suppression…' : 'Supprimer définitivement'}
            </Button>
            <Button variant="outline" onClick={() => { setOuvert(false); setSaisie('') }}>
              Annuler
            </Button>
          </div>
          {supprimer.isError && <p className="text-xs text-destructive">{supprimer.error instanceof Error ? supprimer.error.message : 'Échec de la suppression.'}</p>}
        </div>
      )}
    </div>
  )
}
