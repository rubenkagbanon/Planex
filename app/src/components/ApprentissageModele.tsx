import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { FileUp } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { HorairesDuModele } from '@/components/HorairesDuModele'
import {
  cleLibelle,
  extrairePdf,
  harmoniserProfesseurs,
  IGNORER,
  lireTextesPdf,
  versLignesVersion,
  type ClassePdf,
  type LigneVersion,
  type TextePdf,
} from '@/lib/importEdtPdf'
import { DISCIPLINES } from '@/lib/horairesReference'
import { useEtablissement } from '@/hooks/useEtablissement'
import { useSourcesEmploiDuTemps } from '@/hooks/useBibliotheque'
import { EMPLOI_DU_TEMPS_QUERY_KEY, useEmploiDuTempsData } from '@/hooks/useEmploiDuTempsData'
import { apprendreModele, appliquerConstats, creneauxDuModele, type Constat } from '@/lib/apprentissage'
import { estFaitMain, type SeanceComparable } from '@/lib/comparaison'
import type { Cycle } from '@/lib/cycle'
import type { Json } from '@/lib/database.types'
import { REGLES_DESCRIPTIONS } from '@/lib/regles'
import { cn } from '@/lib/utils'

// Libellés propres à l'établissement → matière, mémorisés dans ce navigateur pour les imports suivants
const cleCorrespondances = (etablissementId: string | null) => `planex.correspondances.${etablissementId ?? 'local'}`
function lireCorrespondances(etablissementId: string | null): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(cleCorrespondances(etablissementId)) ?? '{}')
  } catch {
    return {}
  }
}
function ecrireCorrespondances(etablissementId: string | null, valeur: Record<string, string>) {
  try {
    localStorage.setItem(cleCorrespondances(etablissementId), JSON.stringify(valeur))
  } catch {
    // stockage indisponible (navigation privée…) : la correspondance vaut pour cette session
  }
}

interface ImportPdf {
  classes: ClassePdf[]
  libellesInconnus: string[]
  erreurs: { fichier: string; erreur: string }[]
  lignes: LigneVersion[]
}

// Valeur du sélecteur de modèle pour les PDF déposés mais pas encore enregistrés
const SOURCE_PDF = 'pdf'

const CYCLE_LABEL: Record<Cycle, string> = { college: 'Collège', lycee: 'Lycée' }

function resumeSuggestion(c: Constat): string {
  const s = c.suggestion as { actif: boolean; minimum?: number; duree?: number }
  if (!s.actif) return 'Désactiver'
  if (c.key === 'minDisciplinesParJour') return `Minimum ${s.minimum}`
  if (c.key === 'epsAuxBords') return `Activer, séance de ${s.duree}h`
  return 'Activer'
}

// Paramètres › Apprendre d'un modèle : analyse un emploi du temps enregistré (par exemple l'emploi du temps
// réel importé des PDF d'un établissement) et propose les réglages des règles pédagogiques qui
// reproduisent sa façon de disposer les matières.
export function ApprentissageModele() {
  const { etablissementId } = useEtablissement()
  const { data } = useEmploiDuTempsData(etablissementId)
  const queryClient = useQueryClient()

  // Versions de l'année en cours et années de la bibliothèque
  const { sources: versions } = useSourcesEmploiDuTemps(etablissementId)

  const [versionId, setVersionId] = useState<string | null>(null)
  const [cycle, setCycle] = useState<Cycle>('college')
  const [choix, setChoix] = useState<Set<string>>(new Set())
  const [applique, setApplique] = useState<string | null>(null)

  const [importPdf, setImportPdf] = useState<ImportPdf | null>(null)
  const [lecture, setLecture] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  // Texte des PDF lus, gardé pour relancer l'analyse quand le censeur précise un libellé
  const [pagesLues, setPagesLues] = useState<{ fichier: string; pages: TextePdf[][] }[]>([])
  const [erreursLecture, setErreursLecture] = useState<ImportPdf['erreurs']>([])
  const [correspondances, setCorrespondances] = useState<Record<string, string>>({})
  useEffect(() => setCorrespondances(lireCorrespondances(etablissementId)), [etablissementId])

  function analyser(lus: { fichier: string; pages: TextePdf[][] }[], corr: Record<string, string>, erreursLecture: ImportPdf['erreurs'] = []) {
    const classes: ClassePdf[] = []
    const erreurs = [...erreursLecture]
    for (const { fichier, pages } of lus) {
      const r = extrairePdf(pages, fichier, { correspondances: corr })
      classes.push(...r.classes)
      erreurs.push(...r.erreurs)
    }
    // Un même PDF déposé deux fois : on garde la dernière lecture de chaque classe
    const parClasse = new Map(harmoniserProfesseurs(classes).map((c) => [`${c.niveau}-${c.section}`, c]))
    const uniques = [...parClasse.values()].sort((a, b) => `${a.niveau}-${a.section}`.localeCompare(`${b.niveau}-${b.section}`, 'fr', { numeric: true }))
    const libellesInconnus = [...new Set(uniques.flatMap((c) => c.libellesInconnus ?? []))].sort()
    setImportPdf({ classes: uniques, libellesInconnus, erreurs, lignes: versLignesVersion(uniques) })
    return uniques
  }

  function preciserLibelle(libelle: string, matiere: string) {
    const next = { ...correspondances, [cleLibelle(libelle)]: matiere }
    setCorrespondances(next)
    ecrireCorrespondances(etablissementId, next)
    analyser(pagesLues, next, erreursLecture)
  }

  async function lireFichiers(fichiers: File[]) {
    const pdfs = fichiers.filter((f) => f.name.toLowerCase().endsWith('.pdf'))
    if (pdfs.length === 0) return
    const lus: { fichier: string; pages: TextePdf[][] }[] = []
    const erreursLecture: ImportPdf['erreurs'] = []
    for (const [i, fichier] of pdfs.entries()) {
      setLecture(`Lecture ${i + 1}/${pdfs.length} : ${fichier.name}`)
      try {
        lus.push({ fichier: fichier.name, pages: await lireTextesPdf(fichier) })
      } catch (e) {
        erreursLecture.push({ fichier: fichier.name, erreur: e instanceof Error ? e.message : 'PDF illisible' })
      }
    }
    setPagesLues(lus)
    setErreursLecture(erreursLecture)
    const uniques = analyser(lus, correspondances, erreursLecture)
    setVersionId(SOURCE_PDF)
    if (uniques.length > 0 && !uniques.some((c) => c.cycle === cycle)) setCycle(uniques[0].cycle)
    setLecture(null)
  }

  const enregistrerVersion = useMutation({
    mutationFn: async () => {
      if (!importPdf || !etablissementId) return null
      const label = `Emploi du temps importé des PDF (${importPdf.classes.length} classes, ${new Date().toLocaleDateString('fr-FR')})`
      const { data: row, error } = await supabase
        .from('emploi_du_temps_versions')
        .insert({ etablissement_id: etablissementId, label, nb_seances: importPdf.lignes.length, seances: importPdf.lignes as unknown as Json })
        .select('id')
        .single()
      if (error) throw error
      return row.id
    },
    onSuccess: async (id) => {
      await queryClient.invalidateQueries({ queryKey: ['versions_comparaison', etablissementId] })
      if (id) setVersionId(id)
      setImportPdf(null)
    },
  })

  const versionChoisie =
    versionId === SOURCE_PDF ? null : versions?.find((v) => v.id === versionId) ?? versions?.find((v) => estFaitMain(v.label)) ?? versions?.[0]
  const modeleSource =
    versionId === SOURCE_PDF && importPdf
      ? { id: SOURCE_PDF, seances: importPdf.lignes }
      : versionChoisie
        ? { id: versionChoisie.id, seances: versionChoisie.seances as unknown as LigneVersion[] }
        : null

  const modele = useMemo(() => {
    if (!modeleSource || !data) return null
    // Les créneaux viennent du modèle lui-même, pas des horaires du compte (qui peuvent être vides ou
    // différents) ; l'heure de fin manquante est complétée par celle du créneau configuré au même horaire.
    const finConfiguree = new Map(data.creneaux.map((c) => [`${c.cycle}|${c.heure_debut}`, c.heure_fin]))
    const { slotsByJourByCycle, creneauId } = creneauxDuModele(
      modeleSource.seances.map((s) => ({
        cycle: s.cycle as Cycle,
        jour: s.jour,
        heureDebut: s.heure_debut,
        heureFin: s.heure_fin ?? finConfiguree.get(`${s.cycle}|${s.heure_debut}`),
      })),
    )
    const seances: SeanceComparable[] = modeleSource.seances.map((s) => ({
      cycle: s.cycle as Cycle,
      niveau: s.niveau,
      section: s.section,
      matiere: s.matiere,
      professeur: s.professeur_nom,
      jour: s.jour,
      heureDebut: s.heure_debut,
      creneauId: creneauId(s.cycle as Cycle, s.heure_debut),
      salle: s.salle_nom,
      groupe: s.groupe_seance,
    }))
    return apprendreModele(seances, slotsByJourByCycle, data.reglesByCycle)
    // modeleSource est recalculé à chaque rendu : on dépend de ce qui le détermine
  }, [modeleSource?.id, versionChoisie, importPdf, data])

  const duCycle = modele?.[cycle] ?? null

  // Pré-coche les suggestions recommandées à chaque changement de modèle ou de cycle ; après un
  // enregistrement, les réglages désormais identiques se décochent d'eux-mêmes.
  const cleSelection = `${modeleSource?.id}|${cycle}|${!!duCycle}`
  useEffect(() => {
    setChoix(new Set(duCycle?.constats.filter((c) => c.recommandee).map((c) => c.key) ?? []))
    setApplique(null)
  }, [cleSelection])
  useEffect(() => {
    setChoix((prev) => new Set([...prev].filter((key) => duCycle?.constats.some((c) => c.key === key && c.changement))))
  }, [duCycle])

  const appliquer = useMutation({
    mutationFn: async () => {
      if (!data || !duCycle || !etablissementId) return
      const choisis = duCycle.constats.filter((c) => choix.has(c.key))
      const regles = appliquerConstats(data.reglesByCycle[cycle], choisis)
      const { error } = await supabase
        .from('horaires_contraintes')
        .update({ regles: regles as unknown as Json })
        .eq('etablissement_id', etablissementId)
        .eq('cycle', cycle)
      if (error) throw error
      return choisis.length
    },
    onSuccess: (nb) => {
      setApplique(`${nb} réglage${(nb ?? 0) > 1 ? 's' : ''} appliqué${(nb ?? 0) > 1 ? 's' : ''} au ${CYCLE_LABEL[cycle].toLowerCase()} — relance la génération pour en profiter.`)
      queryClient.invalidateQueries({ queryKey: [EMPLOI_DU_TEMPS_QUERY_KEY] })
      queryClient.invalidateQueries({ queryKey: ['horaires_contraintes_regles'] })
    },
  })

  if (!versions || !data) return <p className="text-sm text-muted-foreground">Chargement…</p>

  const titreRegle = (key: string) => REGLES_DESCRIPTIONS.find((r) => r.key === key)?.titre ?? key

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="font-serif text-lg font-semibold text-foreground">Apprendre d'un emploi du temps existant</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Planex analyse un emploi du temps réel — comment chaque matière est découpée en séances, ce qui s'enchaîne,
          où tombe l'EPS, les demi-journées libres des professeurs — et propose les réglages des règles pédagogiques
          qui reproduisent ces habitudes pour les prochains emplois du temps. Rien n'est modifié tant que tu n'as pas
          cliqué sur « Appliquer ».
        </p>

        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            lireFichiers([...e.dataTransfer.files])
          }}
          className="mt-4 rounded-lg border-2 border-dashed border-border bg-background px-4 py-4"
        >
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" size="sm" disabled={!!lecture} onClick={() => inputRef.current?.click()}>
              <FileUp className="mr-1 h-4 w-4" /> Importer les PDF des emplois du temps de classe
            </Button>
            <span className="text-xs text-muted-foreground">
              {lecture ?? 'ou dépose-les ici — un PDF par classe, tous en une fois (sélection multiple).'}
            </span>
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf,.pdf"
              multiple
              className="hidden"
              onChange={(e) => {
                lireFichiers([...(e.target.files ?? [])])
                e.target.value = ''
              }}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Planex reconnaît les grilles par classe — jours en colonnes, horaires en lignes, une page par classe ou un
            fichier par classe — qu'elles viennent d'un logiciel de vie scolaire, de Word ou d'Excel. Les professeurs
            sont lus dans les cases ou dans la liste en en-tête (« PC : M. KOUADIO »). Un PDF scanné (photo) ne peut
            pas être lu : exporte-le directement en PDF. Les PDF sont lus sur ton ordinateur ; rien
            n'est enregistré tant que tu ne cliques pas sur « Enregistrer comme version ».
          </p>

          {importPdf && (
            <div className="mt-3 space-y-1 border-t border-border pt-3 text-sm">
              <p className="font-semibold text-foreground">
                {importPdf.classes.length} classe{importPdf.classes.length > 1 ? 's' : ''} lue{importPdf.classes.length > 1 ? 's' : ''},{' '}
                {importPdf.lignes.length} séances
                {importPdf.classes.every((c) => c.anomalies.length === 0) && importPdf.classes.length > 0 && (
                  <span className="ml-2 font-normal text-primary">
                    — {importPdf.classes.every((c) => c.heuresAnnoncees !== null) ? "chaque classe retombe sur son total d'heures annoncé" : 'aucune anomalie'}
                  </span>
                )}
              </p>
              {importPdf.classes.length > 0 && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Voir le détail par classe</summary>
                  <div className="mt-2 grid gap-x-6 gap-y-0.5 sm:grid-cols-2 lg:grid-cols-3">
                    {importPdf.classes.map((c) => (
                      <div key={`${c.niveau}-${c.section}`} className="flex justify-between gap-2 border-b border-border/60 py-0.5">
                        <span className="font-medium text-foreground">
                          {c.niveau} {c.section}
                        </span>
                        <span className="truncate text-muted-foreground">
                          {c.heuresLues} h · {new Set(c.seances.map((s) => s.professeur).filter(Boolean)).size} prof.{c.professeurPrincipal ? ` · PP ${c.professeurPrincipal}` : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
              {importPdf.libellesInconnus.length > 0 && (
                <div className="rounded-md border border-primary/40 bg-primary/5 p-3">
                  <p className="text-xs font-semibold text-foreground">
                    {importPdf.libellesInconnus.length} libellé{importPdf.libellesInconnus.length > 1 ? 's' : ''} non reconnu{importPdf.libellesInconnus.length > 1 ? 's' : ''} : à quelle matière correspond{importPdf.libellesInconnus.length > 1 ? 'ent-ils' : '-il'} ?
                  </p>
                  <p className="mb-2 text-[11px] text-muted-foreground">Ton choix est retenu pour les prochains imports de cet établissement.</p>
                  <div className="flex flex-wrap gap-3">
                    {importPdf.libellesInconnus.map((libelle) => (
                      <label key={libelle} className="flex items-center gap-2 text-xs">
                        <span className="rounded bg-card px-2 py-1 font-semibold text-foreground">{libelle}</span>
                        →
                        <select
                          defaultValue=""
                          onChange={(e) => e.target.value && preciserLibelle(libelle, e.target.value)}
                          className="rounded-md border border-border bg-card px-2 py-1 text-xs"
                        >
                          <option value="">Choisir…</option>
                          {DISCIPLINES.map((d) => (
                            <option key={d} value={d}>
                              {d}
                            </option>
                          ))}
                          <option value={IGNORER}>Pas une matière (ignorer)</option>
                        </select>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              {importPdf.classes
                .filter((c) => c.anomalies.length > 0)
                .map((c) => (
                  <p key={c.fichier} className="text-xs text-destructive">
                    {c.fichier} : {c.anomalies.join(' ; ')}
                  </p>
                ))}
              {importPdf.erreurs.map((e) => (
                <p key={e.fichier} className="text-xs text-destructive">
                  {e.fichier} ignoré : {e.erreur}
                </p>
              ))}
              {importPdf.classes.length > 0 && (
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <Button type="button" size="sm" variant="outline" disabled={enregistrerVersion.isPending} onClick={() => enregistrerVersion.mutate()}>
                    {enregistrerVersion.isPending ? 'Enregistrement…' : 'Enregistrer comme version'}
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Pour le retrouver plus tard ici et dans Vue d'ensemble › Comparer.
                  </span>
                  {enregistrerVersion.isError && (
                    <span className="text-xs text-destructive">
                      {enregistrerVersion.error instanceof Error ? enregistrerVersion.error.message : 'Échec de l’enregistrement.'}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2">
            Modèle
            <select
              value={modeleSource?.id ?? ''}
              onChange={(e) => setVersionId(e.target.value)}
              className="rounded-md border border-border bg-card px-2 py-1 text-sm"
            >
              {!modeleSource && <option value="">Aucun — importe les PDF ci-dessus</option>}
              {importPdf && importPdf.classes.length > 0 && (
                <option value={SOURCE_PDF}>
                  PDF importés, non enregistrés ({importPdf.classes.length} classes, {importPdf.lignes.length} séances)
                </option>
              )}
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label} ({v.nb_seances} séances)
                </option>
              ))}
            </select>
          </label>
          <div className="flex gap-1">
            {(['college', 'lycee'] as Cycle[]).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCycle(c)}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-semibold',
                  cycle === c ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:text-foreground',
                )}
              >
                {CYCLE_LABEL[c]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {modeleSource && etablissementId && <HorairesDuModele lignes={modeleSource.seances} data={data} etablissementId={etablissementId} />}

      {!modeleSource ? null : !duCycle ? (
        <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
          Ce modèle ne contient aucune séance du {CYCLE_LABEL[cycle].toLowerCase()}.
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-border bg-card">
            <div className="px-6 pb-3 pt-5">
              <h3 className="font-serif text-base font-semibold text-foreground">Découpage des matières</h3>
              <p className="text-xs text-muted-foreground">
                {duCycle.nbClasses} classes, {duCycle.nbSeances} séances analysées. Pour chaque volume hebdomadaire :
                comment les heures sont réparties en séances (2 = double cours), et combien de classes le font ainsi. Pour reproduire un découpage, saisis-le dans la grille horaire (ex. « 2+1+1 »).
              </p>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-6 py-2 font-semibold">Matière</th>
                  <th className="px-6 py-2 font-semibold">Observé</th>
                </tr>
              </thead>
              <tbody>
                {duCycle.decoupage.map((l) => (
                  <tr key={l.matiere} className="border-b border-border last:border-0">
                    <td className="px-6 py-2 font-medium text-foreground">{l.matiere}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {l.observations.map((o) => (
                          <span key={`${o.heures}|${o.decoupage}`} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-foreground">
                            {o.heures}h : {o.decoupage} <span className="text-muted-foreground">×{o.nb}</span>
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-xl border border-border bg-card">
            <div className="px-6 pb-3 pt-5">
              <h3 className="font-serif text-base font-semibold text-foreground">Ce que le modèle pratique</h3>
              <p className="text-xs text-muted-foreground">
                Chaque règle pédagogique est mesurée dans le modèle. Les suggestions qui rapprochent Planex du modèle sans
                assouplir une règle sont pré-cochées ; celles qui en désactivent une restent à ton jugement.
              </p>
            </div>
            {duCycle.constats.map((c) => (
              <label key={c.key} className="flex cursor-pointer items-start gap-3 border-t border-border px-6 py-3">
                <input
                  type="checkbox"
                  className="mt-1"
                  disabled={!c.changement}
                  checked={choix.has(c.key)}
                  onChange={(e) => {
                    const next = new Set(choix)
                    if (e.target.checked) next.add(c.key)
                    else next.delete(c.key)
                    setChoix(next)
                  }}
                />
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{titreRegle(c.key)}</span>
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                        c.changement ? 'bg-secondary text-secondary-foreground' : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {c.changement ? resumeSuggestion(c) : 'Déjà réglé ainsi'}
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{c.observe}</div>
                </div>
              </label>
            ))}
            {duCycle.remarques.length > 0 && (
              <div className="border-t border-border px-6 py-3 text-xs text-muted-foreground">
                {duCycle.remarques.map((r) => (
                  <div key={r}>• {r}</div>
                ))}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-3 border-t border-border px-6 py-4">
              <button
                type="button"
                disabled={choix.size === 0 || appliquer.isPending}
                onClick={() => appliquer.mutate()}
                className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                {appliquer.isPending ? 'Application…' : `Appliquer ${choix.size} réglage${choix.size > 1 ? 's' : ''} au ${CYCLE_LABEL[cycle].toLowerCase()}`}
              </button>
              {applique && <span className="text-sm text-primary">{applique}</span>}
              {appliquer.isError && (
                <span className="text-sm text-destructive">
                  {appliquer.error instanceof Error ? appliquer.error.message : 'Échec de l’enregistrement.'}
                </span>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
