import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Archive, BookOpen, CalendarRange, FileSpreadsheet, Lock, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { AppHeader } from '@/components/AppHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useEtablissement } from '@/hooks/useEtablissement'
import { useEmploiDuTempsData } from '@/hooks/useEmploiDuTempsData'
import { useBibliotheque, useSourcesEmploiDuTemps } from '@/hooks/useBibliotheque'
import { anneeScolaire } from '@/lib/anneeScolaire'
import {
  anneeSuivante,
  documentsArchive,
  donneesArchive,
  exporterArchiveExcel,
  grilleArchive,
  seancesArchive,
  texteCase,
  versionsArchive,
  type AnneeArchivee,
  type TypeDocArchive,
} from '@/lib/bibliotheque'
import { estFaitMain } from '@/lib/comparaison'
import type { Json } from '@/lib/database.types'
import type { LigneVersion } from '@/lib/importEdtPdf'
import { colorForMatiere } from '@/lib/matiereColor'
import { cn } from '@/lib/utils'

const TYPES: { key: TypeDocArchive; label: string }[] = [
  { key: 'classe', label: 'Classes' },
  { key: 'professeur', label: 'Professeurs' },
  { key: 'salle', label: 'Salles' },
]
const JOUR_COURT: Record<string, string> = { lundi: 'Lundi', mardi: 'Mardi', mercredi: 'Mercredi', jeudi: 'Jeudi', vendredi: 'Vendredi', samedi: 'Samedi' }
const h = (hhmmss: string) => hhmmss.slice(0, 5).replace(':', 'h')

// Bibliothèque des années scolaires : l'année active d'un côté (avec sa clôture), les années archivées de
// l'autre, consultables, exportables et réutilisables (Comparer, Apprendre d'un modèle).
export function Bibliotheque() {
  const { etablissementId, etablissement, isAdmin } = useEtablissement()
  const { data: bibliotheque, isLoading } = useBibliotheque(etablissementId)
  const { data } = useEmploiDuTempsData(etablissementId)
  const { sources } = useSourcesEmploiDuTemps(etablissementId)
  const queryClient = useQueryClient()
  const [selection, setSelection] = useState<string | null>(null)

  const anneeActive = anneeScolaire(etablissement?.annee_scolaire)
  const annees = bibliotheque?.annees ?? []
  const choisie = annees.find((a) => a.id === selection) ?? null

  const toutRafraichir = () => queryClient.invalidateQueries()

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-8">
        <div className="mb-1 text-xs font-semibold uppercase tracking-[1.5px] text-primary">Bibliothèque</div>
        <h1 className="mb-2 font-serif text-3xl font-semibold">Les années scolaires de l’établissement</h1>
        <p className="mb-8 max-w-3xl text-sm text-muted-foreground">
          Planex travaille sur une année à la fois. En fin d’année, clôture-la : tout est rangé ici (paramétrage, emploi du temps,
          versions) et l’année suivante démarre avec le même paramétrage, à ajuster. Les années rangées restent consultables,
          exportables en Excel, et servent à comparer ou à apprendre les habitudes de l’établissement.
        </p>

        {isLoading || !bibliotheque ? (
          <p className="text-sm text-muted-foreground">Chargement…</p>
        ) : !bibliotheque.disponible ? (
          <div className="rounded-xl border border-primary/40 bg-card p-6 text-sm">
            <p className="font-semibold text-foreground">La bibliothèque n’est pas encore activée sur la base de données.</p>
            <p className="mt-1 text-muted-foreground">
              Applique la migration <code className="rounded bg-muted px-1">supabase/migrations/20261002120000_bibliotheque_annees.sql</code> dans
              l’éditeur SQL de Supabase, puis recharge la page.
            </p>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
            <div className="flex flex-col gap-6">
              <AnneeEnCours
                annee={anneeActive}
                anneeSaisie={!!etablissement?.annee_scolaire?.trim()}
                isAdmin={isAdmin}
                nbSeances={data?.seances.length ?? 0}
                nbClasses={data?.classeOptions.length ?? 0}
                nbVersions={sources?.filter((s) => s.provenance === 'version').length ?? 0}
                dejaArchivee={annees.some((a) => a.annee_scolaire === anneeActive)}
                onClose={toutRafraichir}
              />

              <div className="rounded-xl border border-border bg-card">
                <div className="flex items-center gap-2 px-5 pb-2 pt-4">
                  <Archive className="h-4 w-4 text-primary" />
                  <h2 className="font-serif text-base font-semibold">Années rangées</h2>
                </div>
                {annees.length === 0 ? (
                  <p className="px-5 pb-5 text-sm text-muted-foreground">
                    Aucune année pour l’instant. Elles apparaîtront ici à la clôture de l’année en cours, ou en rangeant un emploi du
                    temps importé des PDF (ci-dessous).
                  </p>
                ) : (
                  <div className="flex flex-col">
                    {annees.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => setSelection(a.id)}
                        className={cn(
                          'flex items-center justify-between gap-3 border-t border-border px-5 py-3 text-left transition-colors',
                          choisie?.id === a.id ? 'bg-secondary text-secondary-foreground' : 'hover:bg-muted/50',
                        )}
                      >
                        <div>
                          <div className="font-serif text-lg font-semibold">{a.annee_scolaire}</div>
                          <div className={cn('text-xs', choisie?.id === a.id ? 'text-secondary-foreground/75' : 'text-muted-foreground')}>
                            {a.origine === 'import' ? 'Importée des PDF' : 'Clôturée dans Planex'} · {a.nb_classes} classes · {a.nb_seances} séances
                          </div>
                        </div>
                        <Lock className="h-4 w-4 opacity-60" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {isAdmin && (
                <RangerImport
                  versions={(sources ?? []).filter((s) => s.provenance === 'version' && estFaitMain(s.label))}
                  anneesPrises={new Set(annees.map((a) => a.annee_scolaire))}
                  etablissementId={etablissementId}
                  onDone={(id) => {
                    toutRafraichir()
                    if (id) setSelection(id)
                  }}
                />
              )}
            </div>

            <div>
              {choisie ? (
                <AnneeArchiveeDetail
                  key={choisie.id}
                  annee={choisie}
                  isAdmin={isAdmin}
                  onDeleted={() => {
                    setSelection(null)
                    toutRafraichir()
                  }}
                />
              ) : (
                <div className="flex h-full min-h-64 flex-col items-center justify-center rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                  <BookOpen className="mb-3 h-8 w-8 text-primary/60" />
                  {annees.length > 0 ? 'Choisis une année à gauche pour consulter ses emplois du temps.' : 'Les années rangées s’afficheront ici.'}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

function AnneeEnCours(props: {
  annee: string
  anneeSaisie: boolean
  isAdmin: boolean
  nbSeances: number
  nbClasses: number
  nbVersions: number
  dejaArchivee: boolean
  onClose: () => void
}) {
  const { annee, anneeSaisie, isAdmin, nbSeances, nbClasses, nbVersions, dejaArchivee, onClose } = props
  const [ouvert, setOuvert] = useState(false)
  const [nouvelle, setNouvelle] = useState('')
  const [viderEdt, setViderEdt] = useState(true)
  const [viderPP, setViderPP] = useState(true)
  const [confirme, setConfirme] = useState(false)
  const [fait, setFait] = useState<string | null>(null)

  const cloturer = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('cloturer_annee', {
        p_nouvelle_annee: nouvelle.trim(),
        p_vider_emploi_du_temps: viderEdt,
        p_vider_professeurs_principaux: viderPP,
      })
      if (error) throw error
    },
    onSuccess: () => {
      setFait(`L’année ${annee} est rangée dans la bibliothèque. Bienvenue en ${nouvelle.trim()} !`)
      setOuvert(false)
      setConfirme(false)
      onClose()
    },
  })

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <CalendarRange className="h-4 w-4 text-primary" /> Année en cours
      </div>
      <div className="mt-1 font-serif text-3xl font-semibold text-foreground">{annee}</div>
      <p className="mt-1 text-xs text-muted-foreground">
        {nbClasses} classes · {nbSeances} séances · {nbVersions} version{nbVersions > 1 ? 's' : ''} enregistrée{nbVersions > 1 ? 's' : ''}
        {!anneeSaisie && (
          <>
            {' '}· année déduite de la date :{' '}
            <Link to="/parametres-etablissement" className="font-semibold text-primary underline">
              la renseigner
            </Link>
          </>
        )}
      </p>
      {fait && <p className="mt-3 text-sm text-primary">{fait}</p>}

      {!isAdmin ? (
        <p className="mt-4 text-xs text-muted-foreground">Seul l’administrateur de l’établissement peut clôturer l’année.</p>
      ) : dejaArchivee ? (
        <p className="mt-4 text-xs text-destructive">
          Une année {annee} est déjà dans la bibliothèque : change l’année en cours dans Paramètres › Établissement ou supprime
          l’archive avant de clôturer.
        </p>
      ) : !ouvert ? (
        <Button className="mt-4 w-full" variant="outline" onClick={() => {
            setNouvelle(anneeSuivante(annee))
            setOuvert(true)
          }}>
          Clôturer l’année et préparer la suivante
        </Button>
      ) : (
        <div className="mt-4 space-y-3 border-t border-border pt-4 text-sm">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-foreground">Nouvelle année scolaire</span>
            <Input value={nouvelle} onChange={(e) => setNouvelle(e.target.value)} placeholder="2026-2027" />
          </label>
          <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
            <p className="mb-1 font-semibold text-foreground">Rangé dans la bibliothèque ({annee}) :</p>
            paramétrage complet (établissement, classes, professeurs, salles, horaires, grille, règles), emploi du temps final et
            ses {nbVersions} version{nbVersions > 1 ? 's' : ''}.
            <p className="mb-1 mt-2 font-semibold text-foreground">Gardé pour {nouvelle.trim() || 'la nouvelle année'} :</p>
            établissement, classes, professeurs, salles, horaires, grille et règles — à ajuster (nouvelles classes, mouvements de
            professeurs).
          </div>
          <label className="flex items-start gap-2 text-xs">
            <input type="checkbox" className="mt-0.5" checked={viderEdt} onChange={(e) => setViderEdt(e.target.checked)} />
            Repartir d’un emploi du temps vide (recommandé : il sera régénéré avec les données de la nouvelle année)
          </label>
          <label className="flex items-start gap-2 text-xs">
            <input type="checkbox" className="mt-0.5" checked={viderPP} onChange={(e) => setViderPP(e.target.checked)} />
            Effacer les professeurs principaux (ils changent en général d’une année à l’autre)
          </label>
          <label className="flex items-start gap-2 text-xs font-semibold text-foreground">
            <input type="checkbox" className="mt-0.5" checked={confirme} onChange={(e) => setConfirme(e.target.checked)} />
            Je confirme la clôture de l’année {annee}
          </label>
          <div className="flex gap-2">
            <Button
              className="flex-1"
              disabled={!confirme || !nouvelle.trim() || nouvelle.trim() === annee || cloturer.isPending}
              onClick={() => cloturer.mutate()}
            >
              {cloturer.isPending ? 'Clôture…' : `Clôturer ${annee}`}
            </Button>
            <Button variant="outline" onClick={() => setOuvert(false)}>
              Annuler
            </Button>
          </div>
          {cloturer.isError && (
            <p className="text-xs text-destructive">{cloturer.error instanceof Error ? cloturer.error.message : 'Échec de la clôture.'}</p>
          )}
        </div>
      )}
    </div>
  )
}

function RangerImport(props: {
  versions: { id: string; label: string; nb_seances: number; seances: Json }[]
  anneesPrises: Set<string>
  etablissementId: string | null
  onDone: (id: string | null) => void
}) {
  const { versions, anneesPrises, etablissementId, onDone } = props
  const [versionId, setVersionId] = useState('')
  const [annee, setAnnee] = useState('')
  const version = versions.find((v) => v.id === versionId) ?? versions[0]

  const ranger = useMutation({
    mutationFn: async () => {
      if (!version || !etablissementId) return null
      const lignes = version.seances as unknown as LigneVersion[]
      const { data: row, error } = await supabase
        .from('annees_archivees')
        .insert({
          etablissement_id: etablissementId,
          annee_scolaire: annee.trim(),
          origine: 'import',
          nb_seances: lignes.length,
          nb_classes: new Set(lignes.map((l) => `${l.niveau}-${l.section}`)).size,
          nb_professeurs: new Set(lignes.map((l) => l.professeur_nom.trim().toLowerCase())).size,
          seances: version.seances,
          versions: [],
        })
        .select('id')
        .single()
      if (error) throw error
      // La version est désormais rangée avec son année
      const { error: deleteError } = await supabase.from('emploi_du_temps_versions').delete().eq('id', version.id)
      if (deleteError) throw deleteError
      return row.id
    },
    onSuccess: (id) => {
      setAnnee('')
      onDone(id)
    },
  })

  if (versions.length === 0) return null
  const anneeValide = /^\d{4}\s*[-–]\s*\d{4}$/.test(annee.trim()) && !anneesPrises.has(annee.trim())

  return (
    <div className="rounded-xl border border-border bg-card p-5 text-sm">
      <h2 className="font-serif text-base font-semibold">Ranger une année passée</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Un emploi du temps importé des PDF appartient à une autre année ? Range-le à son année : il quitte les versions de l’année
        en cours et reste disponible pour comparer et apprendre.
      </p>
      <div className="mt-3 flex flex-col gap-2">
        <select
          value={version?.id ?? ''}
          onChange={(e) => setVersionId(e.target.value)}
          className="rounded-md border border-border bg-card px-2 py-2 text-xs"
        >
          {versions.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label} ({v.nb_seances} séances)
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <Input value={annee} onChange={(e) => setAnnee(e.target.value)} placeholder="Année, ex. 2023-2024" />
          <Button disabled={!anneeValide || ranger.isPending} onClick={() => ranger.mutate()}>
            Ranger
          </Button>
        </div>
        {annee.trim() && anneesPrises.has(annee.trim()) && <p className="text-xs text-destructive">Cette année est déjà dans la bibliothèque.</p>}
        {ranger.isError && <p className="text-xs text-destructive">{ranger.error instanceof Error ? ranger.error.message : 'Échec.'}</p>}
      </div>
    </div>
  )
}

function AnneeArchiveeDetail({ annee, isAdmin, onDeleted }: { annee: AnneeArchivee; isAdmin: boolean; onDeleted: () => void }) {
  const [type, setType] = useState<TypeDocArchive>('classe')
  const docs = useMemo(() => documentsArchive(seancesArchive(annee), type), [annee, type])
  const [cle, setCle] = useState<string | null>(null)
  const doc = docs.find((d) => d.key === cle) ?? docs[0]
  const grille = useMemo(() => (doc ? grilleArchive(annee, doc.cycles) : null), [annee, doc])
  const donnees = donneesArchive(annee)
  const versions = versionsArchive(annee)
  const pp = type === 'classe' && doc ? donnees.classes_details?.find((d) => `${d.niveau}-${d.section}` === doc.key)?.professeur_principal : null
  const [export_, setExport] = useState(false)
  const [suppression, setSuppression] = useState(false)

  const supprimer = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('annees_archivees').delete().eq('id', annee.id)
      if (error) throw error
    },
    onSuccess: onDeleted,
  })

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {annee.origine === 'import' ? 'Importée des PDF' : 'Clôturée dans Planex'} · rangée le{' '}
              {new Date(annee.created_at).toLocaleDateString('fr-FR')}
            </div>
            <h2 className="font-serif text-2xl font-semibold">Année {annee.annee_scolaire}</h2>
            <p className="text-xs text-muted-foreground">
              {annee.nb_classes} classes · {annee.nb_professeurs} professeurs · {annee.nb_seances} séances
              {versions.length > 0 && ` · ${versions.length} version${versions.length > 1 ? 's' : ''}`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={export_ || docs.length === 0}
              onClick={async () => {
                setExport(true)
                try {
                  await exporterArchiveExcel(annee, type)
                } finally {
                  setExport(false)
                }
              }}
            >
              <FileSpreadsheet className="mr-1 h-3.5 w-3.5" /> {export_ ? 'Export…' : `Excel (${TYPES.find((t) => t.key === type)?.label.toLowerCase()})`}
            </Button>
            {isAdmin && (
              <Button size="sm" variant="outline" className="text-destructive" onClick={() => setSuppression(true)}>
                <Trash2 className="mr-1 h-3.5 w-3.5" /> Supprimer
              </Button>
            )}
          </div>
        </div>
        {suppression && (
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-md border border-destructive/40 p-3 text-xs">
            <span className="text-destructive">Supprimer définitivement l’année {annee.annee_scolaire} de la bibliothèque ?</span>
            <Button size="sm" variant="outline" className="text-destructive" disabled={supprimer.isPending} onClick={() => supprimer.mutate()}>
              Oui, supprimer
            </Button>
            <Button size="sm" variant="outline" onClick={() => setSuppression(false)}>
              Annuler
            </Button>
          </div>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Réutiliser cette année : Vue d’ensemble ›{' '}
          <Link to="/vue-ensemble" className="font-semibold text-primary underline">
            Comparer
          </Link>{' '}
          (avec l’année en cours) ou Paramètres ›{' '}
          <Link to="/parametres-modele" className="font-semibold text-primary underline">
            Apprendre d’un modèle
          </Link>
          .
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {TYPES.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => {
                setType(t.key)
                setCle(null)
              }}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-semibold',
                type === t.key ? 'border-secondary bg-secondary text-secondary-foreground' : 'border-border text-muted-foreground hover:text-foreground',
              )}
            >
              {t.label}
            </button>
          ))}
          {docs.length > 0 && (
            <select value={doc?.key ?? ''} onChange={(e) => setCle(e.target.value)} className="ml-auto rounded-md border border-border bg-card px-2 py-1 text-sm">
              {docs.map((d) => (
                <option key={d.key} value={d.key}>
                  {d.titre}
                </option>
              ))}
            </select>
          )}
        </div>
        {!doc || !grille ? (
          <p className="text-sm text-muted-foreground">Aucune donnée de ce type dans cette année.</p>
        ) : (
          <>
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-serif text-lg font-semibold">{doc.titre}</h3>
              <span className="text-xs text-muted-foreground">
                {new Set(doc.seances.map((s) => `${s.jour}|${s.heure_debut}`)).size} h / semaine{pp ? ` · Professeur principal : ${pp}` : ''}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] table-fixed border-collapse text-[11px]">
                <thead>
                  <tr className="bg-secondary text-secondary-foreground">
                    <th className="w-24 px-2 py-1.5 text-left">Horaires</th>
                    {grille.jours.map((j) => (
                      <th key={j} className="px-2 py-1.5">
                        {JOUR_COURT[j] ?? j}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {grille.lignes.map((l) =>
                    l.type !== 'cours' ? (
                      <tr key={l.heureDebut} className="border-t border-border bg-muted/40">
                        <td className="px-2 py-1 text-muted-foreground">
                          {h(l.heureDebut)} - {h(l.heureFin)}
                        </td>
                        <td colSpan={grille.jours.length} className="text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {l.type === 'recreation' ? 'Récréation' : 'Pause déjeuner'}
                        </td>
                      </tr>
                    ) : (
                      <tr key={l.heureDebut} className="border-t border-border">
                        <td className="px-2 py-1 text-muted-foreground">
                          {h(l.heureDebut)} - {h(l.heureFin)}
                        </td>
                        {grille.jours.map((j) => {
                          const contenu = doc.seances.filter((s) => s.jour === j && s.heure_debut === l.heureDebut)
                          return (
                            <td
                              key={j}
                              className="h-10 border-l border-border px-1 text-center leading-tight"
                              style={contenu[0] ? { backgroundColor: colorForMatiere(contenu[0].matiere) } : undefined}
                            >
                              {contenu.length > 0 ? texteCase(contenu, type) : ''}
                            </td>
                          )
                        })}
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {versions.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4 text-xs">
          <h3 className="mb-2 text-sm font-semibold">Versions enregistrées pendant l’année</h3>
          <ul className="space-y-1 text-muted-foreground">
            {versions.map((v, i) => (
              <li key={i}>
                {v.label} — {v.nb_seances} séances
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
