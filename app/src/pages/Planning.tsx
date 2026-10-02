import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { Lock, LockOpen, Printer, Undo2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useProfile } from '@/hooks/useProfile'
import { EMPLOI_DU_TEMPS_QUERY_KEY, useEmploiDuTempsData, type EmploiDuTempsData } from '@/hooks/useEmploiDuTempsData'
import { AppHeader } from '@/components/AppHeader'
import { Button } from '@/components/ui/button'
import { cycleForNiveau, type Cycle } from '@/lib/cycle'
import { colorForMatiere } from '@/lib/matiereColor'
import { calculerEchange, reaffecterSalles, verifierDeplacements, type Deplacement } from '@/lib/edition'
import { analyserEntorses, groupSlotsByJour } from '@/lib/scheduling/entorses'
import {
  classeLabel,
  construireLignes,
  estVieScolaire,
  formatHeure,
  joursActifs,
  libellePause,
  seancesDeCase,
  type GrilleLigne,
  type SeanceRow,
} from '@/lib/timetable'
import type { Json } from '@/lib/database.types'
import { cn } from '@/lib/utils'

type EntityType = 'classe' | 'professeur' | 'salle'

interface Selection {
  type: EntityType
  key: string
  label: string
  cycles: Cycle[]
  filtre: (s: SeanceRow) => boolean
}

function cellId(jour: string, ligneKey: string) {
  return `${jour}::${ligneKey}`
}

// Contenu d'une case : une ou plusieurs séances (tandem : plusieurs groupes en parallèle).
function ContenuCase({
  seances,
  type,
  data,
}: {
  seances: SeanceRow[]
  type: EntityType
  data: EmploiDuTempsData
}) {
  return (
    <div className="flex flex-col gap-1">
      {seances.map((s) => {
        const prof = data.profNameById[s.professeur_id] ?? ''
        const salle = s.salle_id ? data.salleNomById[s.salle_id] : null
        const autresClasses = s.groupe_seance
          ? data.seances.filter((o) => o.groupe_seance === s.groupe_seance && (o.niveau !== s.niveau || o.section !== s.section))
          : []
        return (
          <div key={s.id} className="flex flex-col items-center leading-tight">
            {type === 'classe' ? (
              <>
                <span className="text-[11px] font-semibold uppercase text-foreground">{s.matiere}</span>
                {salle && <span className="text-[10px] font-semibold text-[#2F6F52]">{salle}</span>}
                <span className="text-[10px] text-primary">{prof}</span>
              </>
            ) : (
              <>
                <span className="text-[11px] font-semibold text-foreground">{classeLabel(s.niveau, s.section)}</span>
                <span className="text-[10px] text-muted-foreground">{s.matiere}</span>
                {type === 'salle' ? <span className="text-[10px] text-primary">{prof}</span> : salle && <span className="text-[10px] font-semibold text-[#2F6F52]">{salle}</span>}
              </>
            )}
            {autresClasses.length > 0 && (
              <span className="text-[9px] text-muted-foreground">
                + {[...new Set(autresClasses.map((o) => classeLabel(o.niveau, o.section)))].join(', ')}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

function CaseEditable({
  id,
  type,
  seances,
  couleur,
  data,
  onToggleLock,
}: {
  id: string
  type: EntityType
  seances: SeanceRow[]
  couleur: string | undefined
  data: EmploiDuTempsData
  onToggleLock: (seances: SeanceRow[]) => void
}) {
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id })
  const { attributes, listeners, setNodeRef: setDragRef, transform, isDragging } = useDraggable({ id, disabled: seances.length === 0 })
  const verrouillee = seances.length > 0 && seances.every((s) => s.verrouille)

  return (
    <td
      ref={setDropRef}
      className={cn('relative border-l border-border p-1 text-center align-middle', isOver && 'outline outline-2 -outline-offset-2 outline-primary')}
      style={couleur ? { backgroundColor: couleur } : undefined}
    >
      {seances.length > 0 ? (
        <div
          ref={setDragRef}
          {...listeners}
          {...attributes}
          className={cn('cursor-grab rounded px-1 py-1 active:cursor-grabbing', isDragging && 'relative z-20 bg-card shadow-lg')}
          style={transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined}
        >
          <ContenuCase seances={seances} type={type} data={data} />
        </div>
      ) : (
        <span className="text-muted-foreground/40">—</span>
      )}
      {seances.length > 0 && (
        <button
          type="button"
          onClick={() => onToggleLock(seances)}
          onPointerDown={(e) => e.stopPropagation()}
          className={cn('absolute right-0.5 top-0.5 rounded p-0.5', verrouillee ? 'text-primary' : 'text-muted-foreground/40 hover:text-foreground')}
          aria-label={verrouillee ? 'Déverrouiller cette séance' : 'Verrouiller cette séance'}
          title={verrouillee ? 'Verrouillée : la génération ne la déplacera pas' : 'Verrouiller (la génération la gardera telle quelle)'}
        >
          {verrouillee ? <Lock className="h-3 w-3" /> : <LockOpen className="h-3 w-3" />}
        </button>
      )}
    </td>
  )
}

function Grille({
  data,
  selection,
  editable,
  onDeplacer,
  onToggleLock,
}: {
  data: EmploiDuTempsData
  selection: Selection
  editable: boolean
  onDeplacer: (source: { jour: string; ligne: GrilleLigne }, cible: { jour: string; ligne: GrilleLigne }) => void
  onToggleLock: (seances: SeanceRow[]) => void
}) {
  const lignes = construireLignes(data.creneaux, selection.cycles)
  const jours = joursActifs(data.contraintes, selection.cycles)
  const couleur = data.contraintes.some((c) => selection.cycles.includes(c.cycle as Cycle) && c.couleur_matieres)
  const seances = data.seances.filter(selection.filtre)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  function handleDragEnd(event: DragEndEvent) {
    if (!event.over || event.active.id === event.over.id) return
    const [jourSource, ligneSource] = String(event.active.id).split('::')
    const [jourCible, ligneCible] = String(event.over.id).split('::')
    const source = lignes.find((l) => l.key === ligneSource)
    const cible = lignes.find((l) => l.key === ligneCible)
    if (source && cible) onDeplacer({ jour: jourSource, ligne: source }, { jour: jourCible, ligne: cible })
  }

  const tableau = (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[720px] table-fixed border-collapse text-sm">
        <thead>
          <tr className="bg-secondary text-secondary-foreground">
            <th className="w-28 whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide">Horaires</th>
            {jours.map((j) => (
              <th key={j.key} className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide">
                {j.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lignes.map((ligne) => {
            if (ligne.type !== 'cours') {
              return (
                <tr key={ligne.key} className="border-t border-border">
                  <td className="whitespace-nowrap px-3 py-1.5 text-xs font-medium text-muted-foreground">
                    {formatHeure(ligne.heureDebut)} - {formatHeure(ligne.heureFin)}
                  </td>
                  <td colSpan={jours.length} className="bg-muted/50 px-3 py-1.5 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {libellePause(ligne.type)}
                  </td>
                </tr>
              )
            }
            return (
              <tr key={ligne.key} className="border-t border-border">
                <td className="whitespace-nowrap px-3 py-2 text-xs font-medium text-muted-foreground">
                  {formatHeure(ligne.heureDebut)} - {formatHeure(ligne.heureFin)}
                </td>
                {jours.map((j) => {
                  if (estVieScolaire(j.key, ligne, data.contraintes, data.creneaux, selection.cycles)) {
                    return (
                      <td key={j.key} className="border-l border-border bg-muted/30 px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Vie scolaire
                      </td>
                    )
                  }
                  const contenu = seancesDeCase(seances, j.key, ligne)
                  const fond = contenu.length > 0 && couleur ? colorForMatiere(contenu[0].matiere) : undefined
                  if (editable) {
                    return (
                      <CaseEditable
                        key={j.key}
                        id={cellId(j.key, ligne.key)}
                        type={selection.type}
                        seances={contenu}
                        couleur={fond}
                        data={data}
                        onToggleLock={onToggleLock}
                      />
                    )
                  }
                  return (
                    <td key={j.key} className="border-l border-border p-1 text-center align-middle" style={fond ? { backgroundColor: fond } : undefined}>
                      {contenu.length > 0 ? (
                        <ContenuCase seances={contenu} type={selection.type} data={data} />
                      ) : (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )

  return editable ? (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      {tableau}
    </DndContext>
  ) : (
    tableau
  )
}

interface Retour {
  libelle: string
  positions: Deplacement[]
}

export function Planning() {
  const { data: profile } = useProfile()
  const etablissementId = profile?.etablissement_id ?? null
  const queryClient = useQueryClient()
  const { data } = useEmploiDuTempsData(etablissementId)

  const [entityType, setEntityType] = useState<EntityType>('classe')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'erreur' | 'info'; lignes: string[] } | null>(null)
  const [historique, setHistorique] = useState<Retour[]>([])

  useEffect(() => {
    setSelectedKey(null)
    setMessage(null)
  }, [entityType])

  const options = useMemo((): Selection[] => {
    if (!data) return []
    if (entityType === 'classe') {
      return data.classeOptions.map((c) => ({
        type: 'classe' as const,
        key: c.key,
        label: c.label,
        cycles: [c.cycle],
        filtre: (s: SeanceRow) => s.niveau === c.niveau && s.section === c.section,
      }))
    }
    if (entityType === 'professeur') {
      return [...data.professeurIdsParNom.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([nom, ids]) => {
          const idSet = new Set(ids)
          const cycles = new Set<Cycle>()
          for (const p of data.professeurs.filter((p) => idSet.has(p.id))) {
            for (const code of p.niveaux) cycles.add(cycleForNiveau(code.split('-')[0]))
          }
          return {
            type: 'professeur' as const,
            key: nom,
            label: nom,
            cycles: [...cycles].sort(),
            filtre: (s: SeanceRow) => idSet.has(s.professeur_id),
          }
        })
    }
    return data.salles.map((salle) => ({
      type: 'salle' as const,
      key: salle.id,
      label: salle.nom,
      cycles: ['college', 'lycee'].filter((cycle) => data.contraintes.some((c) => c.cycle === cycle)) as Cycle[],
      filtre: (s: SeanceRow) => s.salle_id === salle.id,
    }))
  }, [data, entityType])

  const selection = options.find((o) => o.key === selectedKey) ?? null

  const invalider = () => queryClient.invalidateQueries({ queryKey: [EMPLOI_DU_TEMPS_QUERY_KEY, etablissementId] })

  const appliquerMutation = useMutation({
    mutationFn: async (deplacements: Deplacement[]) => {
      const { error } = await supabase.rpc('appliquer_deplacements', {
        p_deplacements: deplacements.map((d) => ({
          id: d.id,
          jour: d.jour,
          creneau_id: d.creneauId,
          salle_id: d.salleId,
          verrouille: d.verrouille ?? null,
        })) as unknown as Json,
      })
      if (error) throw error
    },
    onSuccess: invalider,
    onError: (error) => setMessage({ type: 'erreur', lignes: [error instanceof Error ? error.message : 'Modification refusée.'] }),
  })

  const lockMutation = useMutation({
    mutationFn: async ({ ids, verrouille }: { ids: string[]; verrouille: boolean }) => {
      const { error } = await supabase.from('emploi_du_temps').update({ verrouille }).in('id', ids)
      if (error) throw error
    },
    onSuccess: invalider,
  })

  function positionsActuelles(ids: string[]): Deplacement[] {
    return (data?.seances ?? [])
      .filter((s) => ids.includes(s.id))
      .map((s) => ({ id: s.id, jour: s.jour, creneauId: s.creneau_id, salleId: s.salle_id, verrouille: s.verrouille }))
  }

  function deplacer(source: { jour: string; ligne: GrilleLigne }, cible: { jour: string; ligne: GrilleLigne }) {
    if (!data || !selection) return
    const seances = data.seances.filter(selection.filtre)
    const contenuSource = seancesDeCase(seances, source.jour, source.ligne)
    const contenuCible = seancesDeCase(seances, cible.jour, cible.ligne)
    if (contenuSource.length === 0) return
    // Cycle de la séance déplacée : dans la vue professeur, la grille peut mêler collège et lycée.
    const cycle = contenuSource[0].cycle as Cycle
    if (estVieScolaire(cible.jour, cible.ligne, data.contraintes, data.creneaux, [cycle])) {
      setMessage({ type: 'erreur', lignes: ['Le mercredi après-midi est réservé à la vie scolaire.'] })
      return
    }
    const premierCreneau = (ligne: GrilleLigne) => ligne.idsByCycle[cycle] ?? Object.values(ligne.idsByCycle).find(Boolean)
    const creneauCible = premierCreneau(cible.ligne)
    const creneauSource = premierCreneau(source.ligne)
    if (!creneauCible || !creneauSource) return

    // Vue professeur : si la case cible est libre pour le professeur mais que la classe y a cours avec un
    // collègue, on échange les deux heures de la classe (le collègue reprend l'horaire de départ).
    let contenuEchange = contenuCible
    if (selection.type === 'professeur' && contenuCible.length === 0) {
      const classes = new Set(contenuSource.map((s) => `${s.niveau}|${s.section}`))
      contenuEchange = seancesDeCase(
        data.seances.filter((s) => classes.has(`${s.niveau}|${s.section}`)),
        cible.jour,
        cible.ligne,
      )
    }

    const creneauById = new Map(data.creneaux.map((c) => [c.id, c]))
    const echange = calculerEchange(
      data.seances,
      contenuSource,
      contenuEchange,
      { jour: cible.jour, creneauId: creneauCible },
      { jour: source.jour, creneauId: creneauSource },
      creneauById,
    )
    if (typeof echange === 'string') {
      setMessage({ type: 'erreur', lignes: [echange] })
      return
    }
    // Salle occupée au nouvel horaire : une autre salle libre du même type est attribuée (ou aucune).
    const { deplacements, changements: sallesChangees } = reaffecterSalles(data.seances, echange, data.salles, creneauById)
    const conflits = verifierDeplacements(data.seances, deplacements, {
      creneauById,
      profNameById: data.profNameById,
      salleById: new Map(data.salles.map((s) => [s.id, { nom: s.nom, capacite: s.capacite }])),
      indisponibilites: data.indisponibilites,
    })
    if (conflits.length > 0) {
      setMessage({ type: 'erreur', lignes: ['Déplacement impossible :', ...conflits] })
      return
    }

    // Règles pédagogiques : simple avertissement (le censeur garde la main), comparé à avant le déplacement.
    const parId = new Map(deplacements.map((d) => [d.id, d]))
    const apres = data.seances.map((s) => {
      const d = parId.get(s.id)
      return d ? { ...s, jour: d.jour, creneau_id: d.creneauId } : s
    })
    const slotsByJourByCycle = {
      college: groupSlotsByJour(data.slotsByCycle.college),
      lycee: groupSlotsByJour(data.slotsByCycle.lycee),
    }
    const classesTouchees = new Set(apres.filter((s) => parId.has(s.id)).map((s) => `${s.niveau}|${s.section}`))
    const analyser = (liste: SeanceRow[]) =>
      analyserEntorses(
        liste
          .filter((s) => classesTouchees.has(`${s.niveau}|${s.section}`))
          .map((s) => ({ niveau: s.niveau, section: s.section, matiere: s.matiere, cycle: s.cycle as Cycle, jour: s.jour, creneauId: s.creneau_id })),
        slotsByJourByCycle,
        data.reglesByCycle,
      )
    const avantDetails = new Set(analyser(data.seances).map((e) => e.detail))
    const nouvelles = analyser(apres).filter((e) => !avantDetails.has(e.detail))

    setHistorique((h) => [...h, { libelle: `${selection.label} — déplacement`, positions: positionsActuelles(deplacements.map((d) => d.id)) }])
    appliquerMutation.mutate(deplacements)
    setMessage(
      nouvelles.length > 0
        ? { type: 'info', lignes: ['Séance déplacée et verrouillée. Attention, règles pédagogiques non respectées :', ...nouvelles.map((e) => e.detail), ...sallesChangees] }
        : { type: 'info', lignes: ['Séance déplacée et verrouillée : la prochaine génération la gardera à cette place.', ...sallesChangees] },
    )
  }

  function annuler() {
    const dernier = historique[historique.length - 1]
    if (!dernier) return
    setHistorique((h) => h.slice(0, -1))
    appliquerMutation.mutate(dernier.positions)
    setMessage({ type: 'info', lignes: ['Dernier déplacement annulé.'] })
  }

  function toggleLock(seances: SeanceRow[]) {
    if (!data) return
    const groupes = new Set(seances.map((s) => s.groupe_seance).filter(Boolean))
    const ids = data.seances.filter((s) => seances.some((x) => x.id === s.id) || (s.groupe_seance && groupes.has(s.groupe_seance))).map((s) => s.id)
    lockMutation.mutate({ ids, verrouille: !seances.every((s) => s.verrouille) })
  }

  const seancesSelection = selection && data ? data.seances.filter(selection.filtre) : []
  const toutesVerrouillees = seancesSelection.length > 0 && seancesSelection.every((s) => s.verrouille)
  const nbHeures = selection?.type === 'classe' ? new Set(seancesSelection.map((s) => `${s.jour}|${s.creneau_id}`)).size : seancesSelection.length

  const tabs: { key: EntityType; label: string }[] = [
    { key: 'classe', label: 'Classe' },
    { key: 'professeur', label: 'Professeur' },
    ...(data && data.salles.length > 0 ? [{ key: 'salle' as const, label: 'Salle' }] : []),
  ]

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppHeader />

      <main className="mx-auto max-w-6xl p-8">
        <div className="mb-2 text-xs font-semibold uppercase tracking-[1.5px] text-primary">Emploi du temps</div>
        <h1 className="mb-6 font-serif text-3xl font-semibold text-foreground">
          {selection ? selection.label : 'Sélectionne une classe, un professeur ou une salle'}
        </h1>

        <div className="mb-5 inline-flex gap-1 rounded-lg border border-border bg-card p-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setEntityType(tab.key)}
              className={cn(
                'rounded-md px-4 py-2 text-sm font-semibold transition-colors',
                entityType === tab.key ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="mb-6 flex flex-wrap gap-1.5">
          {data && options.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {entityType === 'classe'
                ? 'Aucune classe configurée — renseigne-les dans Paramètres > Classes.'
                : 'Aucun professeur configuré — renseigne-les dans Paramètres > Professeurs.'}
            </p>
          )}
          {options.map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => {
                setSelectedKey(o.key)
                setMessage(null)
              }}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                selectedKey === o.key ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:text-foreground',
              )}
            >
              {o.label}
            </button>
          ))}
        </div>

        {data && selection && (
          <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-semibold text-foreground">
                {selection.type === 'classe' ? 'NOMBRE HEURES DE COURS PAR SEMAINE' : 'HEURES PAR SEMAINE'} = {nbHeures}H
                {selection.type === 'classe' && (() => {
                  const pp = data.classesDetails.find((d) => `${d.niveau}-${d.section}` === selection.key)?.professeur_principal
                  return pp ? <span className="ml-4 font-normal text-muted-foreground">Professeur principal : {pp}</span> : null
                })()}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {selection.type !== 'salle' && (
                  <>
                    <Button size="sm" variant="outline" onClick={annuler} disabled={historique.length === 0 || appliquerMutation.isPending}>
                      <Undo2 className="mr-1 h-3.5 w-3.5" /> Annuler le dernier déplacement
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={seancesSelection.length === 0}
                      onClick={() => lockMutation.mutate({ ids: seancesSelection.map((s) => s.id), verrouille: !toutesVerrouillees })}
                    >
                      {toutesVerrouillees ? <LockOpen className="mr-1 h-3.5 w-3.5" /> : <Lock className="mr-1 h-3.5 w-3.5" />}
                      {toutesVerrouillees ? 'Tout déverrouiller' : 'Tout verrouiller'}
                    </Button>
                  </>
                )}
                <Button size="sm" variant="outline" asChild>
                  <Link to={`/impression?type=${selection.type}&cle=${encodeURIComponent(selection.key)}`}>
                    <Printer className="mr-1 h-3.5 w-3.5" /> Imprimer
                  </Link>
                </Button>
              </div>
            </div>

            {selection.type !== 'salle' && (
              <p className="mb-3 text-xs text-muted-foreground">
                {selection.type === 'classe'
                  ? "Glisse une séance vers une autre case pour la déplacer (ou l'échanger avec la séance qui s'y trouve)."
                  : "Glisse une heure du professeur vers une autre case : la classe concernée change d'horaire (si la case contient une autre classe du professeur, les deux heures sont échangées). La classe doit être libre au nouvel horaire, sinon ses deux heures sont échangées si l'autre professeur est disponible."}{' '}
                Chaque modification est contrôlée (professeur, classe, salle, indisponibilités) puis verrouillée
                🔒 : la prochaine génération la conservera.
              </p>
            )}

            {message && (
              <div
                className={cn(
                  'mb-4 rounded-lg border px-4 py-3 text-sm',
                  message.type === 'erreur' ? 'border-destructive text-destructive' : 'border-primary/50 bg-card text-foreground',
                )}
              >
                {message.lignes.map((l, i) => (
                  <p key={i} className={i === 0 ? 'font-semibold' : 'text-xs'}>
                    {i === 0 ? l : `• ${l}`}
                  </p>
                ))}
              </div>
            )}

            <Grille data={data} selection={selection} editable={selection.type !== 'salle'} onDeplacer={deplacer} onToggleLock={toggleLock} />

            {seancesSelection.length === 0 && (
              <p className="mt-4 text-xs text-muted-foreground">
                Aucune séance pour cette sélection — lance la génération depuis le{' '}
                <Link to="/dashboard" className="font-semibold text-primary underline">
                  Dashboard
                </Link>
                .
              </p>
            )}
          </>
        )}
      </main>
    </div>
  )
}
