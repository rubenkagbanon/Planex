import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useEtablissement } from '@/hooks/useEtablissement'
import { useHorairesGrid } from '@/hooks/useHorairesGrid'
import { tableAbsente, useEmploiDuTempsData, type EmploiDuTempsData } from '@/hooks/useEmploiDuTempsData'
import { anneeScolaire } from '@/lib/anneeScolaire'
import { DISCIPLINES, NIVEAUX_ETABLISSEMENT, formatMinutes, minutesForNiveauEtablissement } from '@/lib/horairesReference'
import { JOURS_SEMAINE } from '@/lib/joursSemaine'
import { REGLES_DESCRIPTIONS } from '@/lib/regles'
import { typeSalleLabel } from '@/lib/salles'
import { classeLabel, abregerMatiere } from '@/lib/timetable'
import type { Cycle } from '@/lib/cycle'
import { cn } from '@/lib/utils'
import { volumeFicheMinutes } from '@/lib/volumeFiche'

// Plan de l'organisation de l'emploi du temps : chaque rubrique (établissement, horaires, classes, salles,
// disciplines, enseignants, regroupements, règles, emploi du temps) est présentée comme une table d'un
// schéma de base de données — en-tête, lignes « champ / valeur » — et les liens entre rubriques sont tracés.

type TableId = 'etablissement' | 'horaires' | 'regles' | 'classes' | 'edt' | 'regroupements' | 'enseignants' | 'salles' | 'disciplines'

interface Relation {
  from: TableId
  fromRow?: string
  to: TableId
  label: string
}

interface Ligne {
  cle: string
  champ: string
  valeur: ReactNode
  lien?: boolean
  alerte?: boolean
}

// Résultat d'une table facultative : vide si la migration qui la crée n'est pas encore appliquée.
async function facultatif<T>(promesse: PromiseLike<{ data: T[] | null; error: { code?: string; message?: string } | null }>): Promise<T[]> {
  const { data, error } = await promesse
  if (error) {
    if (tableAbsente(error)) return []
    throw error
  }
  return data ?? []
}

function heureH(hhmmss: string): string {
  return hhmmss.slice(0, 5).replace(':', 'H')
}

// "S1, S2, ..., S12" → "S1 à S12" quand les noms forment une suite continue.
function compacterNoms(noms: string[]): string {
  if (noms.length < 3) return noms.join(', ')
  const parsed = noms.map((n) => n.match(/^(.*?)(\d+)$/))
  if (parsed.every(Boolean)) {
    const prefixes = new Set(parsed.map((m) => m![1]))
    const nums = parsed.map((m) => Number(m![2])).sort((a, b) => a - b)
    if (prefixes.size === 1 && nums.every((n, i) => i === 0 || n === nums[i - 1] + 1)) {
      const p = [...prefixes][0]
      return `${p}${nums[0]} à ${p}${nums[nums.length - 1]}`
    }
  }
  return noms.join(', ')
}

function TableSchema({
  id,
  titre,
  sousTitre,
  lignes,
  enfants,
  actif,
  attenue,
  onHover,
  refTable,
  refLigne,
  className,
}: {
  id: TableId
  titre: string
  sousTitre?: string
  lignes?: Ligne[]
  enfants?: ReactNode
  actif: boolean
  attenue: boolean
  onHover: (id: TableId | null) => void
  refTable: (id: TableId, el: HTMLElement | null) => void
  refLigne: (cle: string, el: HTMLElement | null) => void
  className?: string
}) {
  return (
    <section
      ref={(el) => refTable(id, el)}
      onMouseEnter={() => onHover(id)}
      onMouseLeave={() => onHover(null)}
      className={cn(
        'relative z-10 overflow-hidden rounded-lg border bg-card shadow-sm transition-opacity',
        actif ? 'border-primary' : 'border-border',
        attenue && 'opacity-60',
        className,
      )}
    >
      <header className="flex items-baseline justify-between gap-2 bg-secondary px-3 py-2 text-secondary-foreground">
        <h3 className="font-mono text-xs font-bold uppercase tracking-wide">{titre}</h3>
        {sousTitre && <span className="font-mono text-[10px] opacity-75">{sousTitre}</span>}
      </header>
      {lignes && (
        <div className="divide-y divide-border">
          {lignes.map((l) => (
            <div key={l.cle} ref={(el) => refLigne(`${id}.${l.cle}`, el)} className="relative grid grid-cols-[minmax(90px,38%)_1fr] gap-2 px-3 py-1.5 text-xs">
              <span className={cn('font-mono text-[11px]', l.lien ? 'font-semibold text-primary' : 'text-muted-foreground')}>
                {l.lien && '🔗 '}
                {l.champ}
              </span>
              <span className={cn('text-foreground', l.alerte && 'font-semibold text-destructive')}>{l.valeur}</span>
            </div>
          ))}
        </div>
      )}
      {enfants}
    </section>
  )
}

function construirePlan(
  data: EmploiDuTempsData,
  grid: Record<string, Record<string, string>>,
  extra: {
    regroupements: { id: string; type: string; libelle: string | null; matieres: string[]; classes: string[] }[]
    matieresSalles: { matiere: string; type_salle: string }[]
    derniereGeneration: { created_at: string; total_placees: number; total_charges: number } | null
  },
) {
  const cycles = (['college', 'lycee'] as Cycle[]).filter((c) => data.contraintes.some((x) => x.cycle === c))

  // Horaires : un bloc par cycle (fusionnés si identiques)
  const horairesParCycle = cycles.map((cycle) => {
    const creneaux = data.creneaux.filter((c) => c.cycle === cycle).sort((a, b) => a.heure_debut.localeCompare(b.heure_debut))
    const dejeuner = creneaux.find((c) => c.type === 'dejeuner')
    const matin = creneaux.filter((c) => c.type === 'cours' && (!dejeuner || c.heure_debut < dejeuner.heure_debut))
    const soir = creneaux.filter((c) => c.type === 'cours' && dejeuner && c.heure_debut > dejeuner.heure_debut)
    const recreations = creneaux.filter((c) => c.type === 'recreation')
    const contrainte = data.contraintes.find((c) => c.cycle === cycle)!
    const jours = JOURS_SEMAINE.filter((j) => contrainte.jours_cours.includes(j.key)).map((j) => j.label)
    return {
      cycle,
      signature: JSON.stringify([creneaux.map((c) => [c.heure_debut, c.heure_fin, c.type]), contrainte.jours_cours, contrainte.mercredi_apres_midi_banalise]),
      lignes: [
        {
          cle: 'jours',
          champ: 'jours_cours',
          valeur: `${jours.length > 1 ? `${jours[0]} au ${jours[jours.length - 1].toLowerCase()}` : jours.join('')}${contrainte.mercredi_apres_midi_banalise ? ' — sauf mercredi après-midi (vie scolaire)' : ''}`,
        },
        { cle: 'matin', champ: 'creneaux_matin', valeur: matin.map((c) => `${heureH(c.heure_debut)}–${heureH(c.heure_fin)}`).join(', ') || '—' },
        { cle: 'soir', champ: 'creneaux_apres_midi', valeur: soir.map((c) => `${heureH(c.heure_debut)}–${heureH(c.heure_fin)}`).join(', ') || '—' },
        ...recreations.map((r, i) => ({
          cle: `recre${i}`,
          champ: `recreation${dejeuner && r.heure_debut > dejeuner.heure_debut ? '_apres_midi' : '_matinee'}`,
          valeur: `${heureH(r.heure_debut)}–${heureH(r.heure_fin)}`,
        })),
        ...(dejeuner ? [{ cle: 'dej', champ: 'pause_dejeuner', valeur: `${heureH(dejeuner.heure_debut)}–${heureH(dejeuner.heure_fin)}` }] : []),
        { cle: 'cours', champ: 'creneaux_par_semaine', valeur: `${data.slotsByCycle[cycle].length} créneaux de cours` },
      ] as Ligne[],
    }
  })
  const horairesFusionnes = horairesParCycle.length === 2 && horairesParCycle[0].signature === horairesParCycle[1].signature

  // Classes par niveau
  const niveaux = NIVEAUX_ETABLISSEMENT.filter((n) => data.classeOptions.some((c) => c.niveau === n.key))
  const classesLignes: Ligne[] = niveaux.map((n) => {
    const classes = data.classeOptions.filter((c) => c.niveau === n.key)
    return { cle: n.key, champ: n.label, valeur: `${classes.length} — ${classes.map((c) => c.label).join(' ; ')}` }
  })
  const avecSalle = data.classesDetails.filter((d) => d.salle_id).length
  const avecPP = data.classesDetails.filter((d) => d.professeur_principal).length
  classesLignes.push({ cle: 'total', champ: 'TOTAL', valeur: <strong>{data.classeOptions.length} classes</strong> })
  classesLignes.push({ cle: 'salle', champ: 'salle_attitree', valeur: `${avecSalle}/${data.classeOptions.length} classes`, lien: avecSalle > 0 })
  classesLignes.push({ cle: 'pp', champ: 'professeur_principal', valeur: `${avecPP}/${data.classeOptions.length} classes` })

  // Salles par type
  const typesSalle = [...new Set(data.salles.map((s) => s.type))]
  const usageType = (type: string) => {
    const matieres = extra.matieresSalles.filter((m) => m.type_salle === type).map((m) => m.matiere)
    if (matieres.length > 0) return `Réservé : ${matieres.join(', ')}`
    if (type === 'classe') return 'Tous les cours'
    if (type === 'sport') return 'E.P.S.'
    return '—'
  }
  const sallesLignes: Ligne[] = typesSalle.map((type) => {
    const salles = data.salles.filter((s) => s.type === type)
    const capacites = [...new Set(salles.map((s) => s.capacite))]
    return {
      cle: type,
      champ: typeSalleLabel(type),
      valeur: (
        <>
          <strong>{salles.length}</strong> · {compacterNoms(salles.map((s) => s.nom))}
          {capacites.some((c) => c > 1) && ` · capacité ${capacites.join('/')}`}
          <div className="text-[10px] text-muted-foreground">{usageType(type)}</div>
        </>
      ),
    }
  })

  // Disciplines × niveaux (volumes hebdomadaires) et total pondéré par le nombre de classes
  const nbClasses = (niveau: string) => data.classeOptions.filter((c) => c.niveau === niveau).length
  const enseignantsParMatiere = new Map<string, Set<string>>()
  for (const p of data.professeurs) {
    enseignantsParMatiere.set(p.matiere, (enseignantsParMatiere.get(p.matiere) ?? new Set()).add(p.nom_complet))
  }
  const disciplines = DISCIPLINES.map((d) => {
    const volumes = niveaux.map((n) => minutesForNiveauEtablissement(grid, d, n.key))
    const pondere = niveaux.reduce((sum, n, i) => sum + volumes[i] * nbClasses(n.key), 0)
    return { discipline: d, volumes, pondere, enseignants: enseignantsParMatiere.get(d)?.size ?? 0, salle: extra.matieresSalles.find((m) => m.matiere === d)?.type_salle }
  }).filter((d) => d.pondere > 0 || d.enseignants > 0)

  // Enseignants (une personne = toutes ses fiches)
  const nombreClassesParNiveau = Object.fromEntries(niveaux.map((n) => [n.key, nbClasses(n.key)]))
  const enseignants = [...data.professeurIdsParNom.entries()]
    .map(([nom, ids]) => {
      const fiches = data.professeurs.filter((p) => ids.includes(p.id))
      const niveauxCouverts = new Set(fiches.flatMap((f) => f.niveaux.map((code) => code.split('-')[0])))
      return {
        nom,
        disciplines: [...new Set(fiches.map((f) => f.matiere))],
        volume: fiches.reduce((s, f) => s + volumeFicheMinutes(f, nombreClassesParNiveau, grid), 0) / 60,
        niveaux: niveauxCouverts.size,
      }
    })
    .sort((a, b) => a.disciplines[0].localeCompare(b.disciplines[0]) || a.nom.localeCompare(b.nom))

  // Emploi du temps
  const creneauxClasses = new Set(data.seances.map((s) => `${s.niveau}|${s.section}|${s.jour}|${s.creneau_id}`)).size
  const edtLignes: Ligne[] = [
    { cle: 'classe', champ: 'classe → classes', valeur: `${new Set(data.seances.map((s) => `${s.niveau}-${s.section}`)).size} classes couvertes`, lien: true },
    { cle: 'prof', champ: 'professeur → enseignants', valeur: `${new Set(data.seances.map((s) => data.profNameById[s.professeur_id])).size} enseignants`, lien: true },
    { cle: 'creneau', champ: 'creneau → horaires', valeur: `${creneauxClasses} heures-classe / semaine`, lien: true },
    { cle: 'salle', champ: 'salle → salles', valeur: `${data.seances.filter((s) => s.salle_id).length} séances avec salle`, lien: data.salles.length > 0 },
    { cle: 'seances', champ: 'seances', valeur: data.seances.length },
    { cle: 'verrou', champ: 'verrouillees', valeur: data.seances.filter((s) => s.verrouille).length },
    {
      cle: 'gen',
      champ: 'derniere_generation',
      valeur: extra.derniereGeneration
        ? `${new Date(extra.derniereGeneration.created_at).toLocaleDateString('fr-FR')} — ${extra.derniereGeneration.total_placees}/${extra.derniereGeneration.total_charges} placées`
        : 'aucune',
    },
  ]

  // Regroupements
  const regroupementsLignes: Ligne[] = extra.regroupements.map((r) => ({
    cle: r.id,
    champ: r.type === 'tronc_commun' ? 'tronc_commun' : 'tandem',
    valeur: `${r.libelle ? `${r.libelle} : ` : ''}${r.matieres.map(abregerMatiere).join(' / ')} — ${r.classes
      .map((code) => {
        const [niveau, section] = code.split('-')
        return section ? classeLabel(niveau, Number(section)) : niveau
      })
      .join(', ')}`,
    lien: true,
  }))
  if (regroupementsLignes.length === 0) regroupementsLignes.push({ cle: 'vide', champ: '—', valeur: 'Aucun tronc commun / tandem déclaré' })

  // Règles par cycle
  const reglesLignes: Ligne[] = REGLES_DESCRIPTIONS.map((r) => {
    const actifs = cycles.filter((c) => (data.reglesByCycle[c][r.key] as { actif: boolean }).actif)
    return {
      cle: r.key,
      champ: r.nature === 'stricte' ? 'prioritaire' : r.nature === 'souple' ? 'à éviter' : 'contrôle',
      valeur: (
        <span className={actifs.length === 0 ? 'text-muted-foreground line-through' : undefined}>
          {r.titre}
          {cycles.length > 1 && actifs.length === 1 && <span className="ml-1 text-[10px] text-muted-foreground">({actifs[0] === 'college' ? 'collège' : 'lycée'})</span>}
        </span>
      ),
    }
  })

  return { cycles, horairesParCycle, horairesFusionnes, classesLignes, sallesLignes, disciplines, niveaux, enseignants, edtLignes, regroupementsLignes, reglesLignes }
}

export function PlanEtablissement() {
  const { etablissementId, etablissement } = useEtablissement()
  const { data } = useEmploiDuTempsData(etablissementId)
  const { grid } = useHorairesGrid(etablissementId)
  const [survol, setSurvol] = useState<TableId | null>(null)

  const { data: extra } = useQuery({
    queryKey: ['plan_extra', etablissementId],
    queryFn: async () => {
      const id = etablissementId!
      const [regroupements, matieresSalles, generations, membres] = await Promise.all([
        facultatif(supabase.from('regroupements').select('id, type, libelle, matieres, classes').eq('etablissement_id', id)),
        facultatif(supabase.from('matieres_salles').select('matiere, type_salle').eq('etablissement_id', id)),
        facultatif(supabase.from('generations').select('created_at, total_placees, total_charges').eq('etablissement_id', id).order('created_at', { ascending: false }).limit(1)),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('etablissement_id', id),
      ])
      return { regroupements, matieresSalles, derniereGeneration: generations[0] ?? null, membres: membres.count ?? 0 }
    },
    enabled: !!etablissementId,
  })

  // --- Tracé des liens entre tables ---------------------------------------------------------------
  const conteneurRef = useRef<HTMLDivElement>(null)
  const tables = useRef(new Map<TableId, HTMLElement>())
  const lignesRef = useRef(new Map<string, HTMLElement>())
  const [traces, setTraces] = useState<{ key: string; d: string; from: TableId; to: TableId; x: number; y: number; label: string; boucle: boolean }[]>([])

  const refTable = useCallback((id: TableId, el: HTMLElement | null) => {
    if (el) tables.current.set(id, el)
    else tables.current.delete(id)
  }, [])
  const refLigne = useCallback((cle: string, el: HTMLElement | null) => {
    if (el) lignesRef.current.set(cle, el)
    else lignesRef.current.delete(cle)
  }, [])

  const plan = data && extra ? construirePlan(data, grid, extra) : null

  const relations: Relation[] = plan
    ? [
        { from: 'etablissement', fromRow: 'cycles', to: 'horaires', label: 'organise' },
        { from: 'regles', to: 'horaires', label: 'par cycle' },
        { from: 'edt', fromRow: 'classe', to: 'classes', label: 'classe' },
        { from: 'edt', fromRow: 'creneau', to: 'horaires', label: 'créneau' },
        { from: 'edt', fromRow: 'prof', to: 'enseignants', label: 'professeur' },
        ...(data!.salles.length > 0 ? [{ from: 'edt' as const, fromRow: 'salle', to: 'salles' as const, label: 'salle' }] : []),
        ...(data!.classesDetails.some((d) => d.salle_id) ? [{ from: 'classes' as const, fromRow: 'salle', to: 'salles' as const, label: 'attitrée' }] : []),
        ...(extra!.regroupements.length > 0
          ? [
              { from: 'regroupements' as const, to: 'classes' as const, label: 'classes' },
              { from: 'regroupements' as const, to: 'disciplines' as const, label: 'matières' },
            ]
          : []),
        { from: 'enseignants', to: 'disciplines', label: 'enseigne' },
        ...(extra!.matieresSalles.length > 0 ? [{ from: 'disciplines' as const, to: 'salles' as const, label: 'salle exigée' }] : []),
      ]
    : []
  const relationsKey = relations.map((r) => `${r.from}.${r.fromRow}>${r.to}`).join('|')

  useLayoutEffect(() => {
    const conteneur = conteneurRef.current
    if (!conteneur || !plan) return
    const calculer = () => {
      const base = conteneur.getBoundingClientRect()
      const next = relations.flatMap((r, i) => {
        const a = tables.current.get(r.from)?.getBoundingClientRect()
        const b = tables.current.get(r.to)?.getBoundingClientRect()
        if (!a || !b) return []
        const ligne = r.fromRow ? lignesRef.current.get(`${r.from}.${r.fromRow}`)?.getBoundingClientRect() : undefined
        const yA = (ligne ? ligne.top + ligne.height / 2 : a.top + 18) - base.top
        const yB = b.top + 18 - base.top
        let d: string
        let etiquette: { x: number; y: number } | null = null
        if (b.left >= a.right - 4 || a.left >= b.right - 4) {
          // Tables côte à côte : du bord droit/gauche de l'une au bord en vis-à-vis de l'autre
          const versDroite = b.left >= a.right - 4
          const x1 = (versDroite ? a.right : a.left) - base.left
          const x2 = (versDroite ? b.left : b.right) - base.left
          const dx = Math.max(30, Math.abs(x2 - x1) / 2) * (versDroite ? 1 : -1)
          d = `M ${x1} ${yA} C ${x1 + dx} ${yA}, ${x2 - dx} ${yB}, ${x2} ${yB}`
        } else {
          // Même colonne : boucle par le côté droit
          const x1 = a.right - base.left
          const x2 = b.right - base.left
          const sortie = Math.max(x1, x2) + 36
          d = `M ${x1} ${yA} C ${sortie} ${yA}, ${sortie} ${yB}, ${x2} ${yB}`
          etiquette = { x: x1 + (sortie - x1) * 0.75 + 4, y: (yA + yB) / 2 }
        }
        const coords = d.match(/-?\d+(\.\d+)?/g)!.map(Number)
        const [x1, y1] = coords.slice(0, 2)
        const [x2, y2] = coords.slice(-2)
        return [{ key: `${i}`, d, from: r.from, to: r.to, x: etiquette?.x ?? (x1 + x2) / 2, y: etiquette?.y ?? (y1 + y2) / 2, label: r.label, boucle: !!etiquette }]
      })
      setTraces(next)
    }
    calculer()
    const observer = new ResizeObserver(calculer)
    observer.observe(conteneur)
    window.addEventListener('resize', calculer)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', calculer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!plan, relationsKey])

  if (!data || !extra || !plan) return <p className="text-sm text-muted-foreground">Chargement du plan...</p>

  const lie = (id: TableId) => survol === id || (survol !== null && relations.some((r) => (r.from === survol && r.to === id) || (r.to === survol && r.from === id)))
  const props = (id: TableId) => ({ id, actif: survol === id, attenue: survol !== null && !lie(id), onHover: setSurvol, refTable, refLigne })

  const etablissementLignes: Ligne[] = [
    { cle: 'nom', champ: 'nom', valeur: <strong>{etablissement?.name}</strong> },
    { cle: 'annee', champ: 'annee_scolaire', valeur: anneeScolaire(etablissement?.annee_scolaire) },
    ...(etablissement?.code_etablissement ? [{ cle: 'code', champ: 'code', valeur: etablissement.code_etablissement }] : []),
    ...(etablissement?.statut ? [{ cle: 'statut', champ: 'statut', valeur: etablissement.statut }] : []),
    ...(etablissement?.drena ? [{ cle: 'drena', champ: 'drena', valeur: etablissement.drena }] : []),
    { cle: 'cycles', champ: 'cycles', valeur: plan.cycles.map((c) => (c === 'college' ? 'Collège' : 'Lycée')).join(' + '), lien: true },
    { cle: 'membres', champ: 'membres', valeur: `${extra.membres} compte(s)` },
  ]

  const totalPondere = plan.disciplines.reduce((s, d) => s + d.pondere, 0)

  return (
    <div className="max-w-7xl">
      <p className="mb-6 text-sm text-muted-foreground">
        Plan de l'organisation de l'emploi du temps de l'établissement, sous forme de schéma : chaque rubrique est
        une table, les traits montrent ce qui relie les rubriques entre elles (🔗). Survole une table pour isoler
        ses liens. Le plan se met à jour à chaque modification des paramètres.
      </p>

      <div ref={conteneurRef} className="relative">
        <svg className="pointer-events-none absolute inset-0 z-0 h-full w-full overflow-visible" aria-hidden="true">
          {traces.map((t) => {
            const enAvant = survol !== null && (t.from === survol || t.to === survol)
            const masque = survol !== null && !enAvant
            return (
              <g key={t.key} className="transition-opacity" opacity={masque ? 0.12 : 1}>
                <path d={t.d} fill="none" stroke="var(--primary)" strokeWidth={enAvant ? 2.2 : 1.4} strokeDasharray={enAvant ? undefined : '5 4'} opacity={enAvant ? 0.95 : 0.55} />
                {enAvant && (
                  <text x={t.x} y={t.y - 4} textAnchor={t.boucle ? "start" : "middle"} className="fill-primary font-mono text-[10px] font-semibold">
                    {t.label}
                  </text>
                )}
              </g>
            )
          })}
        </svg>

        <div className="relative grid grid-cols-1 gap-x-16 gap-y-6 lg:grid-cols-3">
          <div className="flex flex-col gap-6">
            <TableSchema {...props('etablissement')} titre="Établissement" lignes={etablissementLignes} />
            <TableSchema
              {...props('horaires')}
              titre="Jours & horaires"
              sousTitre={plan.horairesFusionnes ? 'collège + lycée' : undefined}
              enfants={
                <div className="divide-y divide-border">
                  {(plan.horairesFusionnes ? plan.horairesParCycle.slice(0, 1) : plan.horairesParCycle).map((h) => (
                    <div key={h.cycle}>
                      {!plan.horairesFusionnes && plan.cycles.length > 1 && (
                        <div className="bg-muted/50 px-3 py-1 font-mono text-[10px] font-semibold uppercase">{h.cycle === 'college' ? 'Collège' : 'Lycée'}</div>
                      )}
                      {h.lignes.map((l) => (
                        <div key={l.cle} className="grid grid-cols-[minmax(90px,38%)_1fr] gap-2 border-t border-border px-3 py-1.5 text-xs first:border-t-0">
                          <span className="font-mono text-[11px] text-muted-foreground">{l.champ}</span>
                          <span>{l.valeur}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              }
            />
            <TableSchema {...props('regles')} titre="Règles pédagogiques" sousTitre="paramètres › contraintes" lignes={plan.reglesLignes} />
          </div>

          <div className="flex flex-col gap-6">
            <TableSchema {...props('classes')} titre="Niveaux & classes" sousTitre={`${plan.niveaux.length} niveaux`} lignes={plan.classesLignes} />
            <TableSchema {...props('edt')} titre="Emploi du temps" sousTitre="séances" lignes={plan.edtLignes} />
            <TableSchema {...props('regroupements')} titre="Regroupements" sousTitre="tronc commun · tandem" lignes={plan.regroupementsLignes} />
          </div>

          <div className="flex flex-col gap-6">
            <TableSchema
              {...props('salles')}
              titre="Salles"
              sousTitre={`${data.salles.length} locaux`}
              lignes={plan.sallesLignes.length > 0 ? plan.sallesLignes : [{ cle: 'vide', champ: '—', valeur: 'Aucune salle saisie (facultatif)' }]}
            />
            <TableSchema
              {...props('enseignants')}
              titre="Enseignants"
              sousTitre={`${plan.enseignants.length} personnes`}
              enfants={
                <div className="max-h-[420px] overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-muted font-mono text-[10px] uppercase text-muted-foreground">
                      <tr>
                        <th className="px-3 py-1 text-left">nom</th>
                        <th className="px-1 py-1 text-left">discipline</th>
                        <th className="px-1 py-1 text-right">h/sem</th>
                        <th className="px-3 py-1 text-right" title="Nombre de niveaux différents">niv.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {plan.enseignants.map((e) => (
                        <tr key={e.nom}>
                          <td className="px-3 py-1">{e.nom}</td>
                          <td className="px-1 py-1 font-mono text-[10px] text-primary">{e.disciplines.map(abregerMatiere).join(', ')}</td>
                          <td className="px-1 py-1 text-right tabular-nums">{Math.round(e.volume * 10) / 10}</td>
                          <td className={cn('px-3 py-1 text-right tabular-nums', e.niveaux > 3 && 'font-semibold text-destructive')} title={e.niveaux > 3 ? 'Plus de 3 niveaux différents' : undefined}>
                            {e.niveaux}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              }
            />
          </div>

          <div className="lg:col-span-3">
            <TableSchema
              {...props('disciplines')}
              titre="Volume horaire par discipline et par niveau"
              sousTitre="heures / semaine · paramètres › horaires"
              enfants={
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted font-mono text-[10px] uppercase text-muted-foreground">
                      <tr>
                        <th className="px-3 py-1.5 text-left">discipline</th>
                        {plan.niveaux.map((n) => (
                          <th key={n.key} className="px-2 py-1.5 text-center">
                            {n.label}
                            <div className="font-normal normal-case">×{data.classeOptions.filter((c) => c.niveau === n.key).length}</div>
                          </th>
                        ))}
                        <th className="px-2 py-1.5 text-right" title="Somme des volumes × nombre de classes de chaque niveau">total pondéré</th>
                        <th className="px-2 py-1.5 text-center">ens.</th>
                        <th className="px-3 py-1.5 text-left">salle</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {plan.disciplines.map((d) => (
                        <tr key={d.discipline}>
                          <td className="px-3 py-1 font-medium">{d.discipline}</td>
                          {d.volumes.map((v, i) => (
                            <td key={i} className={cn('px-2 py-1 text-center tabular-nums', v === 0 && 'text-muted-foreground/40')}>
                              {v === 0 ? '—' : formatMinutes(v)}
                            </td>
                          ))}
                          <td className="px-2 py-1 text-right font-semibold tabular-nums">{formatMinutes(d.pondere)}</td>
                          <td className={cn('px-2 py-1 text-center tabular-nums', d.enseignants === 0 && d.pondere > 0 && 'font-semibold text-destructive')}>
                            {d.enseignants}
                          </td>
                          <td className="px-3 py-1 text-muted-foreground">{d.salle ? typeSalleLabel(d.salle) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t-2 border-border font-semibold">
                      <tr>
                        <td className="px-3 py-1.5">TOTAL</td>
                        {plan.niveaux.map((n, i) => (
                          <td key={n.key} className="px-2 py-1.5 text-center tabular-nums">
                            {formatMinutes(plan.disciplines.reduce((s, d) => s + d.volumes[i], 0))}
                          </td>
                        ))}
                        <td className="px-2 py-1.5 text-right tabular-nums">{formatMinutes(totalPondere)}</td>
                        <td className="px-2 py-1.5 text-center tabular-nums">{plan.enseignants.length}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              }
            />
          </div>
        </div>
      </div>
    </div>
  )
}
