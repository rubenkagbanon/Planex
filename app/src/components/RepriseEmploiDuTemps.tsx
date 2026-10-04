import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, ClipboardCheck, Import } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { EmploiDuTempsData } from '@/hooks/useEmploiDuTempsData'
import { useHorairesGrid } from '@/hooks/useHorairesGrid'
import { NIVEAUX_ETABLISSEMENT } from '@/lib/horairesReference'
import type { ClassePdf, LigneVersion } from '@/lib/importEdtPdf'
import { choixParDefaut, preparerReprise, simulerReprise, type ActionProfesseur, type ChoixReprise, type EtatPlanex } from '@/lib/reprise'
import { executerReprise, type ResultatReprise } from '@/lib/repriseExecution'
import { cn } from '@/lib/utils'

const libelleClasse = (code: string) => {
  const i = code.lastIndexOf('-')
  const niveau = code.slice(0, i)
  return `${NIVEAUX_ETABLISSEMENT.find((n) => n.key === niveau)?.label ?? niveau} ${code.slice(i + 1)}`
}
const valeurAction = (a: ActionProfesseur | undefined) => (!a ? 'creer' : a.type === 'existante' || a.type === 'associer' ? `fiche:${a.ficheId}` : a.type)

function Section({ titre, nb, ton = 'neutre', children }: { titre: string; nb?: number; ton?: 'neutre' | 'alerte' | 'ok'; children: ReactNode }) {
  return (
    <details className="group border-t border-border" open={ton === 'alerte'}>
      <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-3 text-sm font-semibold text-foreground hover:bg-muted/40">
        {ton === 'alerte' ? (
          <AlertTriangle className="h-4 w-4 text-primary" />
        ) : ton === 'ok' ? (
          <CheckCircle2 className="h-4 w-4 text-[#2F6F52]" />
        ) : (
          <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
        )}
        {titre}
        {nb !== undefined && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold">{nb}</span>}
        <span className="ml-auto text-xs font-normal text-muted-foreground group-open:hidden">Afficher</span>
        <span className="ml-auto hidden text-xs font-normal text-muted-foreground group-open:inline">Masquer</span>
      </summary>
      <div className="px-5 pb-4">{children}</div>
    </details>
  )
}

// Reprise d'un emploi du temps importé (PDF) comme emploi du temps de Planex : bilan avant reprise (ce qui
// manque dans Planex, problèmes du PDF), choix validés par le censeur (tout est pré-coché), puis reprise des
// séances sans problème, verrouillées. L'emploi du temps actuel est sauvegardé en version avant.
export function RepriseEmploiDuTemps({
  lignes,
  classesPdf,
  data,
  etablissementId,
}: {
  lignes: LigneVersion[]
  classesPdf?: ClassePdf[]
  data: EmploiDuTempsData
  etablissementId: string
}) {
  const queryClient = useQueryClient()
  const { grid } = useHorairesGrid(etablissementId)
  const [ouvert, setOuvert] = useState(false)
  const [choix, setChoix] = useState<ChoixReprise | null>(null)
  const [reprendrePP, setReprendrePP] = useState(true)
  const [confirme, setConfirme] = useState(false)
  const [resultat, setResultat] = useState<ResultatReprise | null>(null)
  const [tousLesProfs, setTousLesProfs] = useState(false)

  const etat: EtatPlanex = useMemo(() => {
    const nombreClasses: Record<string, number> = {}
    for (const c of data.classeOptions) nombreClasses[c.niveau] = Math.max(nombreClasses[c.niveau] ?? 0, c.section)
    return {
      professeurs: data.professeurs.map((p) => ({ id: p.id, nom_complet: p.nom_complet, matiere: p.matiere, niveaux: p.niveaux ?? [] })),
      nombreClasses,
      creneaux: data.creneaux,
      salles: data.salles.map((s) => ({ id: s.id, nom: s.nom, capacite: s.capacite })),
    }
  }, [data])

  const bilan = useMemo(() => (ouvert ? preparerReprise(lignes, etat, grid) : null), [ouvert, lignes, etat, grid])
  const choixActifs = choix ?? (bilan ? choixParDefaut(bilan) : null)
  const simulation = useMemo(() => (bilan && choixActifs ? simulerReprise(lignes, bilan, choixActifs, etat) : null), [bilan, choixActifs, lignes, etat])
  const ppDisponibles = (classesPdf ?? []).filter((c) => c.professeurPrincipal).length

  const reprendre = useMutation({
    mutationFn: () =>
      executerReprise({
        etablissementId,
        lignes,
        bilan: bilan!,
        choix: choixActifs!,
        simulation: simulation!,
        classesPdf,
        reprendreProfesseursPrincipaux: reprendrePP && ppDisponibles > 0,
        nbSeancesActuelles: data.seances.length,
      }),
    onSuccess: (r) => {
      setResultat(r)
      setConfirme(false)
      queryClient.invalidateQueries()
    },
  })

  const changerProf = (cle: string, valeur: string) => {
    if (!choixActifs) return
    const action: ActionProfesseur =
      valeur === 'creer' ? { type: 'creer' } : valeur === 'ignorer' ? { type: 'ignorer' } : { type: 'associer', ficheId: valeur.slice('fiche:'.length) }
    setChoix({ ...choixActifs, professeurs: { ...choixActifs.professeurs, [cle]: action } })
  }

  if (!ouvert) {
    return (
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 font-serif text-base font-semibold text-foreground">
              <Import className="h-4 w-4 text-primary" /> Reprendre cet emploi du temps dans Planex
            </h3>
            <p className="mt-1 max-w-3xl text-xs text-muted-foreground">
              Les séances du modèle deviennent l’emploi du temps de Planex, telles qu’elles sont écrites, et verrouillées. Avant toute
              écriture, un bilan montre ce qui manque dans Planex (professeurs, classes, salles, horaires) et les problèmes du document
              (conflits, volumes) ; rien n’est fait sans ta validation.
            </p>
          </div>
          <Button variant="outline" onClick={() => setOuvert(true)} disabled={lignes.length === 0}>
            Préparer la reprise
          </Button>
        </div>
      </div>
    )
  }

  if (!bilan || !choixActifs || !simulation) return <p className="text-sm text-muted-foreground">Analyse…</p>

  const profsAffiches = tousLesProfs ? bilan.professeurs : bilan.professeurs.filter((p) => p.action.type !== 'existante')
  const nbAction = bilan.professeurs.filter((p) => p.action.type !== 'existante').length
  const fichesParMatiere = (matiere: string) => data.professeurs.filter((f) => f.matiere === matiere).sort((a, b) => a.nom_complet.localeCompare(b.nom_complet, 'fr'))
  const raisons = new Map<string, number>()
  for (const m of simulation.misesDeCote) {
    const famille = m.raison.startsWith('conflit')
      ? 'conflits dans le document'
      : /non repris/.test(m.raison)
        ? 'professeurs non repris'
        : /classe|niveau/.test(m.raison)
          ? 'classes absentes'
          : /horaire/.test(m.raison)
            ? 'horaires absents'
            : /aucun professeur/.test(m.raison)
              ? 'sans professeur dans le document'
              : 'autres'
    raisons.set(famille, (raisons.get(famille) ?? 0) + 1)
  }

  return (
    <div className="rounded-xl border border-primary/40 bg-card">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pb-3 pt-5">
        <div>
          <h3 className="flex items-center gap-2 font-serif text-lg font-semibold text-foreground">
            <Import className="h-4 w-4 text-primary" /> Bilan avant reprise
          </h3>
          <p className="text-xs text-muted-foreground">Tout est pré-coché : vérifie, ajuste si besoin, puis confirme en bas.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setOuvert(false)}>
          Fermer
        </Button>
      </div>

      <div className="grid gap-px border-t border-border bg-border sm:grid-cols-4">
        {[
          { label: 'séances lues', valeur: bilan.nbSeances, ton: '' },
          { label: 'reprises telles quelles', valeur: simulation.reprises.length, ton: 'text-[#2F6F52]' },
          { label: 'mises de côté (expliquées)', valeur: simulation.misesDeCote.length, ton: simulation.misesDeCote.length ? 'text-primary' : '' },
          { label: 'reprises sans leur salle', valeur: simulation.sansSalle.length, ton: '' },
        ].map((c) => (
          <div key={c.label} className="bg-card px-5 py-3">
            <div className={cn('font-serif text-2xl font-semibold', c.ton)}>{c.valeur}</div>
            <div className="text-xs text-muted-foreground">{c.label}</div>
          </div>
        ))}
      </div>

      <Section titre="Professeurs du document" nb={bilan.professeurs.length} ton={nbAction > 0 ? 'alerte' : 'ok'}>
        <p className="mb-2 text-xs text-muted-foreground">
          {nbAction === 0
            ? 'Tous les professeurs du document ont déjà leur fiche dans Planex.'
            : `${nbAction} professeur(s) sans fiche identique : Planex propose de créer la fiche, ou de l’associer à une fiche existante qui lui ressemble. Les classes du document sont ajoutées à la fiche.`}
        </p>
        <label className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={tousLesProfs} onChange={(e) => setTousLesProfs(e.target.checked)} /> Afficher aussi ceux qui ont déjà leur fiche
        </label>
        <div className="max-h-96 overflow-y-auto rounded-md border border-border">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted text-left text-muted-foreground">
              <tr>
                <th className="px-3 py-1.5">Dans le document</th>
                <th className="px-3 py-1.5">Matière</th>
                <th className="px-3 py-1.5">Classes</th>
                <th className="px-3 py-1.5">Dans Planex</th>
              </tr>
            </thead>
            <tbody>
              {profsAffiches.map((p) => {
                const action = choixActifs.professeurs[p.cle]
                return (
                  <tr key={p.cle} className="border-t border-border">
                    <td className="px-3 py-1.5 font-medium text-foreground">{p.nom}</td>
                    <td className="px-3 py-1.5">{p.matiere}</td>
                    <td className="px-3 py-1.5 text-muted-foreground" title={p.classes.map(libelleClasse).join(', ')}>
                      {p.classes.length} ({p.nbSeances} séances)
                    </td>
                    <td className="px-3 py-1.5">
                      <select
                        value={valeurAction(action)}
                        onChange={(e) => changerProf(p.cle, e.target.value)}
                        className={cn('w-full rounded-md border border-border bg-card px-2 py-1', action?.type === 'ignorer' && 'text-destructive')}
                      >
                        <option value="creer">Créer la fiche « {p.nom} »</option>
                        {fichesParMatiere(p.matiere).map((f) => (
                          <option key={f.id} value={`fiche:${f.id}`}>
                            {p.candidates.some((c) => c.id === f.id) ? '★ ' : ''}Fiche : {f.nom_complet}
                          </option>
                        ))}
                        <option value="ignorer">Ne pas reprendre ses séances</option>
                      </select>
                      {p.autreMatiere && action?.type === 'creer' && (
                        <div className="mt-0.5 text-[11px] text-muted-foreground">A déjà une fiche en {p.autreMatiere.matiere} : une fiche par matière.</div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">★ = fiche dont le nom ressemble.</p>
      </Section>

      <Section titre="Classes absentes de Planex" nb={bilan.classesManquantes.length} ton={bilan.classesManquantes.length ? 'alerte' : 'ok'}>
        {bilan.classesManquantes.length === 0 ? (
          <p className="text-xs text-muted-foreground">Toutes les classes du document existent dans Paramètres › Classes.</p>
        ) : (
          <>
            <label className="mb-2 flex items-center gap-2 text-xs font-semibold">
              <input type="checkbox" checked={choixActifs.creerClasses} onChange={(e) => setChoix({ ...choixActifs, creerClasses: e.target.checked })} />
              Créer ces classes (sinon leurs séances sont mises de côté)
            </label>
            <div className="flex flex-wrap gap-1">
              {bilan.classesManquantes.map((c) => (
                <span key={c.code} className={cn('rounded-full px-2 py-0.5 text-[11px]', c.niveauValide ? 'bg-muted' : 'bg-destructive/10 text-destructive')}>
                  {libelleClasse(c.code)}
                  {!c.niveauValide && ' (niveau inconnu)'}
                </span>
              ))}
            </div>
          </>
        )}
      </Section>

      <Section titre="Salles absentes de Planex" nb={bilan.sallesManquantes.length} ton={bilan.sallesManquantes.length ? 'alerte' : 'ok'}>
        {bilan.sallesManquantes.length === 0 ? (
          <p className="text-xs text-muted-foreground">Toutes les salles du document existent déjà (ou le document n’en indique pas).</p>
        ) : (
          <>
            <label className="mb-2 flex items-center gap-2 text-xs font-semibold">
              <input type="checkbox" checked={choixActifs.creerSalles} onChange={(e) => setChoix({ ...choixActifs, creerSalles: e.target.checked })} />
              Créer ces salles (sinon les séances sont reprises sans salle)
            </label>
            <div className="flex flex-wrap gap-1">
              {bilan.sallesManquantes.map((s) => (
                <span key={s.nom} className="rounded-full bg-muted px-2 py-0.5 text-[11px]">
                  {s.nom}
                </span>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">Terrain et amphi : capacité 3 classes ; laboratoire, informatique : type reconnu au nom.</p>
          </>
        )}
      </Section>

      <Section titre="Horaires absents des créneaux de Planex" nb={bilan.horairesManquants.length} ton={bilan.horairesManquants.length ? 'alerte' : 'ok'}>
        {bilan.horairesManquants.length === 0 ? (
          <p className="text-xs text-muted-foreground">Chaque horaire du document correspond à un créneau de Planex.</p>
        ) : (
          <>
            <label className="mb-2 flex items-center gap-2 text-xs font-semibold">
              <input type="checkbox" checked={choixActifs.creerCreneaux} onChange={(e) => setChoix({ ...choixActifs, creerCreneaux: e.target.checked })} />
              Reprendre les horaires du document comme créneaux de Planex
            </label>
            <p className="text-xs text-muted-foreground">
              Horaires concernés : {bilan.horairesManquants.map((h) => `${h.cycle === 'college' ? 'collège' : 'lycée'} ${h.heureDebut.slice(0, 5).replace(':', 'h')}`).join(', ')}.
              Les créneaux qui n’existent pas dans le document sont retirés.
              {data.indisponibilites.length > 0 && ' Les indisponibilités déclarées sur ces créneaux retirés seront perdues.'}
            </p>
          </>
        )}
      </Section>

      <Section titre="Problèmes du document" nb={simulation.misesDeCote.length + simulation.sansSalle.length + bilan.ecartsVolume.length} ton={simulation.misesDeCote.length ? 'alerte' : 'ok'}>
        {simulation.misesDeCote.length === 0 && simulation.sansSalle.length === 0 && bilan.ecartsVolume.length === 0 ? (
          <p className="text-xs text-muted-foreground">Aucun problème : toutes les séances sont reprises telles quelles.</p>
        ) : (
          <div className="space-y-3 text-xs">
            {simulation.misesDeCote.length > 0 && (
              <div>
                <p className="mb-1 font-semibold text-foreground">
                  {simulation.misesDeCote.length} séance(s) mise(s) de côté — {[...raisons].map(([r, n]) => `${r} : ${n}`).join(' · ')}
                </p>
                <p className="mb-1 text-muted-foreground">Elles ne sont pas reprises : tu pourras les placer à la main (Planning) ou laisser la génération compléter.</p>
                <ul className="max-h-48 list-disc space-y-0.5 overflow-y-auto pl-5 text-muted-foreground">
                  {simulation.misesDeCote.map((m, i) => (
                    <li key={i}>
                      <span className="font-medium text-foreground">
                        {libelleClasse(`${m.ligne.niveau}-${m.ligne.section}`)} · {m.ligne.matiere} ({m.ligne.professeur_nom})
                      </span>{' '}
                      — {m.raison}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {simulation.sansSalle.length > 0 && (
              <div>
                <p className="mb-1 font-semibold text-foreground">{simulation.sansSalle.length} séance(s) reprise(s) sans leur salle (salle déjà occupée)</p>
                <ul className="max-h-32 list-disc space-y-0.5 overflow-y-auto pl-5 text-muted-foreground">
                  {simulation.sansSalle.map((m, i) => (
                    <li key={i}>
                      {libelleClasse(`${m.ligne.niveau}-${m.ligne.section}`)} · {m.ligne.matiere} — {m.raison}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {bilan.ecartsVolume.length > 0 && (
              <div>
                <p className="mb-1 font-semibold text-foreground">{bilan.ecartsVolume.length} volume(s) différent(s) de la grille horaire de référence</p>
                <ul className="max-h-32 list-disc space-y-0.5 overflow-y-auto pl-5 text-muted-foreground">
                  {bilan.ecartsVolume.map((e) => (
                    <li key={`${e.classe}|${e.matiere}`}>
                      {libelleClasse(e.classe)} · {e.matiere} : {e.pdf} h dans le document, {e.grille} h dans la grille
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-muted-foreground">Reprises telles quelles ; la prochaine génération suivra la grille.</p>
              </div>
            )}
          </div>
        )}
      </Section>

      <div className="space-y-3 border-t border-border px-5 py-4 text-sm">
        {ppDisponibles > 0 && (
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={reprendrePP} onChange={(e) => setReprendrePP(e.target.checked)} />
            Reprendre aussi les professeurs principaux lus dans les PDF ({ppDisponibles} classes)
          </label>
        )}
        <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
          {data.seances.length > 0
            ? `L’emploi du temps actuel (${data.seances.length} séances) sera remplacé ; il est d’abord enregistré comme version, restaurable depuis le Dashboard.`
            : 'Aucun emploi du temps actuel : les séances reprises deviennent l’emploi du temps de Planex.'}{' '}
          Les séances reprises sont verrouillées 🔒 : une nouvelle génération les garde et ne complète que le reste.
        </div>
        <label className="flex items-center gap-2 text-xs font-semibold">
          <input type="checkbox" checked={confirme} onChange={(e) => setConfirme(e.target.checked)} />
          Je confirme la reprise de {simulation.reprises.length} séances
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <Button disabled={!confirme || reprendre.isPending || simulation.reprises.length === 0} onClick={() => reprendre.mutate()}>
            {reprendre.isPending ? 'Reprise en cours…' : `Reprendre ${simulation.reprises.length} séances`}
          </Button>
          {reprendre.isError && (
            <span className="text-xs text-destructive">
              Échec : {reprendre.error instanceof Error ? reprendre.error.message : 'erreur inconnue'}. L’emploi du temps précédent a été restauré.
            </span>
          )}
        </div>
        {resultat && (
          <div className="rounded-md border border-[#2F6F52]/40 bg-[#2F6F52]/5 p-3 text-xs text-foreground">
            <p className="font-semibold text-[#2F6F52]">Reprise terminée : {resultat.seancesEcrites} séances dans l’emploi du temps.</p>
            <p className="mt-1 text-muted-foreground">
              {resultat.fichesCreees} fiche(s) créée(s), {resultat.fichesMisesAJour} complétée(s), {resultat.classesCreees} classe(s), {resultat.sallesCreees} salle(s)
              {resultat.creneauxModifies && ', créneaux mis à jour'}
              {resultat.sauvegarde && ' · ancien emploi du temps enregistré comme version'}.
            </p>
            <p className="mt-1">
              <Link to="/planning" className="font-semibold text-primary underline">
                Voir le Planning
              </Link>{' '}
              ·{' '}
              <Link to="/vue-ensemble" className="font-semibold text-primary underline">
                Vue d’ensemble
              </Link>
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
