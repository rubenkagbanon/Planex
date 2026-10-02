import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { FileUp, History, PenLine } from 'lucide-react'
import { useSourcesEmploiDuTemps } from '@/hooks/useBibliotheque'
import type { EmploiDuTempsData } from '@/hooks/useEmploiDuTempsData'
import { ecarts, estFaitMain, mesurer, placementsIdentiques, type Mesures, type SeanceComparable } from '@/lib/comparaison'
import type { Cycle } from '@/lib/cycle'
import { REGLES_DESCRIPTIONS } from '@/lib/regles'
import { groupSlotsByJour } from '@/lib/scheduling/entorses'
import { construireLignes, estVieScolaire, formatHeure, joursActifs, libellePause } from '@/lib/timetable'
import { colorForMatiere } from '@/lib/matiereColor'
import { cn } from '@/lib/utils'

interface LigneVersion {
  cycle: string
  jour: string
  heure_debut: string
  niveau: string
  section: number
  matiere: string
  professeur_nom: string
  salle_nom: string | null
  groupe_seance: string | null
}

type Mode = 'main' | 'versions'

// Vue d'ensemble › Comparer : deux usages.
// - « Fait à la main vs Planex » : l'emploi du temps que le censeur avait fait à la main (PDF importés), pour la
//   même année et les mêmes données, face à celui de Planex.
// - « Version précédente vs actuelle » : pour qui crée tout dans Planex, ce qui a changé depuis une version
//   enregistrée (sauvegarde avant génération, avant restauration, ou enregistrée à la main).
// Critères objectifs (volumes, conflits, règles pédagogiques) et grilles d'une classe côte à côte.
export function Comparaison({ data, etablissementId }: { data: EmploiDuTempsData; etablissementId: string }) {
  // Versions de l'année en cours et années de la bibliothèque
  const { sources: versions } = useSourcesEmploiDuTemps(etablissementId)
  const [versionId, setVersionId] = useState<string | null>(null)
  const [modeChoisi, setModeChoisi] = useState<Mode | null>(null)
  const [classe, setClasse] = useState<string>(data.classeOptions[0]?.key ?? '')
  const [details, setDetails] = useState<'conflits' | 'volumes' | null>(null)

  const faitesMain = versions?.filter((v) => estFaitMain(v.label)) ?? []
  const dePlanex = versions?.filter((v) => !estFaitMain(v.label)) ?? []
  const mode: Mode = modeChoisi ?? (faitesMain.length > 0 ? 'main' : 'versions')
  const candidates = mode === 'main' ? faitesMain : dePlanex
  const reference = candidates.find((v) => v.id === versionId) ?? candidates[0]

  const comparaison = useMemo(() => {
    if (!reference) return null
    const creneauParHeure = new Map(data.creneaux.map((c) => [`${c.cycle}|${c.heure_debut}`, c]))
    const versionSeances: SeanceComparable[] = (reference.seances as unknown as LigneVersion[]).map((s) => ({
      cycle: s.cycle as Cycle,
      niveau: s.niveau,
      section: s.section,
      matiere: s.matiere,
      professeur: s.professeur_nom,
      jour: s.jour,
      heureDebut: s.heure_debut,
      creneauId: creneauParHeure.get(`${s.cycle}|${s.heure_debut}`)?.id ?? '',
      salle: s.salle_nom,
      groupe: s.groupe_seance,
    }))
    const creneauById = new Map(data.creneaux.map((c) => [c.id, c]))
    const actuelles: SeanceComparable[] = data.seances.map((s) => ({
      cycle: s.cycle as Cycle,
      niveau: s.niveau,
      section: s.section,
      matiere: s.matiere,
      professeur: data.profNameById[s.professeur_id] ?? '',
      jour: s.jour,
      heureDebut: creneauById.get(s.creneau_id)?.heure_debut ?? '',
      creneauId: s.creneau_id,
      salle: s.salle_id ? data.salleNomById[s.salle_id] : null,
      groupe: s.groupe_seance,
    }))
    const slots = { college: groupSlotsByJour(data.slotsByCycle.college), lycee: groupSlotsByJour(data.slotsByCycle.lycee) }
    const capacite = (nom: string) => data.salles.find((s) => s.nom === nom)?.capacite ?? 1
    const a = mesurer(versionSeances, slots, data.reglesByCycle, capacite)
    const b = mesurer(actuelles, slots, data.reglesByCycle, capacite)
    const decoupages = [...a.decoupages].filter(([cle, d]) => b.decoupages.get(cle) === d).length
    return {
      versionSeances,
      actuelles,
      a,
      b,
      volumes: ecarts(a.volumes, b.volumes),
      services: ecarts(a.services, b.services),
      decoupages: { identiques: decoupages, total: a.decoupages.size },
      identiques: placementsIdentiques(versionSeances, actuelles),
    }
  }, [reference, data])

  if (!versions) return <p className="text-sm text-muted-foreground">Chargement...</p>

  const choixMode = (
    <div className="flex flex-wrap gap-2">
      {(
        [
          { key: 'main', label: 'Fait à la main vs Planex', icone: PenLine, nb: faitesMain.length },
          { key: 'versions', label: 'Version précédente vs actuelle', icone: History, nb: dePlanex.length },
        ] as const
      ).map(({ key, label, icone: Icone, nb }) => (
        <button
          key={key}
          type="button"
          onClick={() => {
            setModeChoisi(key)
            setVersionId(null)
          }}
          className={cn(
            'flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors',
            mode === key ? 'border-secondary bg-secondary text-secondary-foreground' : 'border-border bg-card text-muted-foreground hover:text-foreground',
          )}
        >
          <Icone className="h-4 w-4" /> {label}
          <span className={cn('rounded-full px-1.5 text-[11px]', mode === key ? 'bg-white/15' : 'bg-muted')}>{nb}</span>
        </button>
      ))}
    </div>
  )

  if (data.seances.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        {choixMode}
        <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
          Il n'y a pas encore d'emploi du temps Planex à comparer.{' '}
          <Link to="/dashboard" className="font-semibold text-primary underline">
            Lance la génération
          </Link>{' '}
          depuis le Dashboard, puis reviens ici.
        </div>
      </div>
    )
  }

  if (!reference || !comparaison) {
    return (
      <div className="flex flex-col gap-4">
        {choixMode}
        <div className="rounded-xl border border-border bg-card p-6">
          {mode === 'main' ? (
            <>
              <h3 className="font-serif text-lg font-semibold text-foreground">Aucun emploi du temps fait à la main</h3>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                Tu as créé ton emploi du temps directement dans Planex : il n'y a pas d'emploi du temps fait à la main à
                comparer. Si l'établissement en avait un pour cette année (fait sous Word, Excel ou un autre logiciel), importe
                ses PDF : Planex montrera, avec les mêmes classes et les mêmes professeurs, les conflits et les écarts aux
                règles de chacun.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link
                  to="/parametres-modele"
                  className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
                >
                  <FileUp className="h-4 w-4" /> Importer mes emplois du temps faits à la main (PDF)
                </Link>
                {dePlanex.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setModeChoisi('versions')}
                    className="flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted"
                  >
                    <History className="h-4 w-4" /> Comparer avec une version précédente
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <h3 className="font-serif text-lg font-semibold text-foreground">Aucune version précédente</h3>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                Planex enregistre automatiquement une version avant chaque nouvelle génération ou restauration ; tu peux aussi en
                enregistrer une depuis le Dashboard avant de faire des retouches. Tu pourras alors voir ici ce qui a changé.
              </p>
              <Link to="/dashboard" className="mt-4 inline-block text-sm font-semibold text-primary underline">
                Aller au Dashboard
              </Link>
            </>
          )}
        </div>
      </div>
    )
  }

  const titreA =
    reference.provenance === 'archive'
      ? reference.label.split(' — ')[0]
      : mode === 'main'
        ? 'Fait à la main'
        : `Version du ${new Date(reference.created_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}`
  const titreB = mode === 'main' ? 'Planex (actuel)' : 'Maintenant'

  const { a, b } = comparaison
  const conflits = (m: Mesures, type: string) => m.conflits.filter((c) => c.type === type).length
  const entorses = (m: Mesures, regle: string) => m.entorses.filter((e) => e.regle === regle).length
  const lignes: { label: string; a: string | number; b: string | number; mieux?: 'a' | 'b' | null }[] = [
    { label: 'Classes', a: a.nbClasses, b: b.nbClasses },
    { label: 'Heures de cours (classe × créneau) par semaine', a: a.heuresClasse, b: b.heuresClasse },
    {
      label: 'Volumes classe × matière identiques',
      a: `${comparaison.volumes.identiques} / ${comparaison.volumes.total}`,
      b: `${Math.round((comparaison.volumes.identiques / Math.max(1, comparaison.volumes.total)) * 100)} %`,
    },
    ...(['professeur', 'classe', 'salle'] as const).map((t) => ({
      label: `Conflits de ${t} (deux cours au même moment)`,
      a: conflits(a, t),
      b: conflits(b, t),
      mieux: conflits(a, t) === conflits(b, t) ? null : conflits(b, t) < conflits(a, t) ? ('b' as const) : ('a' as const),
    })),
    ...REGLES_DESCRIPTIONS.filter((r) => entorses(a, r.key) + entorses(b, r.key) > 0).map((r) => ({
      label: `Entorses — ${r.titre}`,
      a: entorses(a, r.key),
      b: entorses(b, r.key),
      mieux: entorses(a, r.key) === entorses(b, r.key) ? null : entorses(b, r.key) < entorses(a, r.key) ? ('b' as const) : ('a' as const),
    })),
    {
      label: 'Découpages en séances identiques (ex. 2+1+1)',
      a: `${comparaison.decoupages.identiques} / ${comparaison.decoupages.total}`,
      b: `${Math.round((comparaison.decoupages.identiques / Math.max(1, comparaison.decoupages.total)) * 100)} %`,
    },
    {
      label: mode === 'main' ? 'Séances placées exactement au même endroit' : 'Séances restées à la même place',
      a: '—',
      b: `${Math.round(comparaison.identiques * 100)} %`,
    },
  ]

  const choix = data.classeOptions.find((c) => c.key === classe)

  return (
    <div className="flex flex-col gap-6">
      {choixMode}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-muted-foreground">
          {mode === 'main' ? 'Emploi du temps fait à la main :' : "Comparer l'emploi du temps actuel à :"}
        </span>
        <select
          value={reference.id}
          onChange={(e) => setVersionId(e.target.value)}
          className="rounded-md border border-border bg-card px-2 py-1.5 text-sm"
        >
          {candidates.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label} ({v.nb_seances} séances)
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-secondary text-secondary-foreground">
              <th className="px-4 py-2 text-left text-xs uppercase">Critère</th>
              <th className="px-4 py-2 text-right text-xs uppercase">{titreA}</th>
              <th className="px-4 py-2 text-right text-xs uppercase">{titreB}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {lignes.map((l) => (
              <tr key={l.label}>
                <td className="px-4 py-2">{l.label}</td>
                <td className={cn('px-4 py-2 text-right tabular-nums', l.mieux === 'a' && 'font-semibold text-[#2F6F52]', l.mieux === 'b' && 'text-destructive')}>{l.a}</td>
                <td className={cn('px-4 py-2 text-right tabular-nums', l.mieux === 'b' && 'font-semibold text-[#2F6F52]', l.mieux === 'a' && 'text-destructive')}>{l.b}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="-mt-3 text-xs text-muted-foreground">
        {mode === 'main'
          ? "À comparer pour la même année et les mêmes données (classes, professeurs, volumes) : un générateur ne retrouve pas la même grille case par case — il existe des milliers d'emplois du temps valides. Ce qui compte, c'est que chaque classe reçoive les mêmes heures des mêmes professeurs, sans aucun conflit, en respectant au mieux les règles pédagogiques."
          : 'Ce qui a changé entre la version enregistrée et l’emploi du temps actuel : retouches, nouvelle génération, professeurs ou classes modifiés.'}
      </p>

      <div className="flex gap-4 text-xs font-semibold">
        <button type="button" className="text-primary hover:underline" onClick={() => setDetails(details === 'conflits' ? null : 'conflits')}>
          {details === 'conflits' ? 'Masquer' : 'Voir'} les conflits ({a.conflits.length} / {b.conflits.length})
        </button>
        <button type="button" className="text-primary hover:underline" onClick={() => setDetails(details === 'volumes' ? null : 'volumes')}>
          {details === 'volumes' ? 'Masquer' : 'Voir'} les écarts de volume ({comparaison.volumes.differences.length})
        </button>
      </div>
      {details === 'conflits' && (
        <div className="grid gap-4 md:grid-cols-2">
          {[
            { titre: titreA, m: a },
            { titre: titreB, m: b },
          ].map(({ titre, m }) => (
            <div key={titre} className="rounded-xl border border-border bg-card p-4">
              <h4 className="mb-2 text-sm font-semibold">
                {titre} — {m.conflits.length} conflit(s)
              </h4>
              <ul className="max-h-72 list-disc overflow-y-auto pl-5 text-xs text-muted-foreground">
                {m.conflits.length === 0 ? <li className="text-[#2F6F52]">Aucun conflit.</li> : m.conflits.map((c, i) => <li key={i}>{c.detail}</li>)}
              </ul>
            </div>
          ))}
        </div>
      )}
      {details === 'volumes' && (
        <div className="rounded-xl border border-border bg-card p-4">
          <ul className="max-h-72 list-disc overflow-y-auto pl-5 text-xs text-muted-foreground">
            {comparaison.volumes.differences.length === 0 ? (
              <li className="text-[#2F6F52]">Volumes identiques pour toutes les classes et toutes les matières.</li>
            ) : (
              comparaison.volumes.differences.map((d) => (
                <li key={d.cle}>
                  {d.cle.replace('|', ' — ')} : {d.a}h ({titreA.toLowerCase()}), {d.b}h ({titreB.toLowerCase()})
                </li>
              ))
            )}
          </ul>
        </div>
      )}

      <div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">Grilles côte à côte :</span>
          <select value={classe} onChange={(e) => setClasse(e.target.value)} className="rounded-md border border-border bg-card px-2 py-1.5 text-sm">
            {data.classeOptions.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        {choix && (
          <div className="grid gap-4 xl:grid-cols-2">
            {[
              { titre: titreA, liste: comparaison.versionSeances },
              { titre: titreB, liste: comparaison.actuelles },
            ].map(({ titre, liste }) => (
              <MiniGrille
                key={titre}
                titre={titre}
                data={data}
                cycle={choix.cycle}
                seances={liste.filter((s) => s.niveau === choix.niveau && s.section === choix.section)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function MiniGrille({ titre, data, cycle, seances }: { titre: string; data: EmploiDuTempsData; cycle: Cycle; seances: SeanceComparable[] }) {
  const lignes = construireLignes(data.creneaux, [cycle])
  const jours = joursActifs(data.contraintes, [cycle])
  const heures = new Set(seances.map((s) => `${s.jour}|${s.heureDebut}`)).size
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between bg-secondary px-3 py-2 text-secondary-foreground">
        <span className="text-xs font-semibold">{titre}</span>
        <span className="text-xs">{heures}h / semaine</span>
      </div>
      <table className="w-full table-fixed border-collapse text-[10px]">
        <thead>
          <tr className="bg-muted text-muted-foreground">
            <th className="w-16 px-1 py-1">Heure</th>
            {jours.map((j) => (
              <th key={j.key} className="px-1 py-1">
                {j.label.slice(0, 3)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lignes.map((l) =>
            l.type !== 'cours' ? (
              <tr key={l.key} className="border-t border-border bg-muted/40">
                <td className="px-1 text-center">{formatHeure(l.heureDebut)}</td>
                <td colSpan={jours.length} className="text-center text-[9px] font-semibold text-muted-foreground">
                  {libellePause(l.type)}
                </td>
              </tr>
            ) : (
              <tr key={l.key} className="border-t border-border">
                <td className="px-1 text-center text-muted-foreground">{formatHeure(l.heureDebut)}</td>
                {jours.map((j) => {
                  if (estVieScolaire(j.key, l, data.contraintes, data.creneaux, [cycle])) {
                    return <td key={j.key} className="border-l border-border bg-muted/30 text-center text-[8px] text-muted-foreground">VS</td>
                  }
                  const contenu = seances.filter((s) => s.jour === j.key && s.heureDebut === l.heureDebut)
                  return (
                    <td
                      key={j.key}
                      className="h-9 border-l border-border px-0.5 text-center leading-tight"
                      style={contenu[0] ? { backgroundColor: colorForMatiere(contenu[0].matiere) } : undefined}
                    >
                      {contenu.map((s, i) => (
                        <div key={i}>
                          <div className="font-semibold">{s.matiere.slice(0, 12)}</div>
                          <div className="text-[9px] text-foreground/70">{s.professeur}</div>
                        </div>
                      ))}
                    </td>
                  )
                })}
              </tr>
            ),
          )}
        </tbody>
      </table>
    </div>
  )
}
