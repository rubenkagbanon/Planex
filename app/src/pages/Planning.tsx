import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useProfile } from '@/hooks/useProfile'
import { AppHeader } from '@/components/AppHeader'
import { NIVEAUX_ETABLISSEMENT } from '@/lib/horairesReference'
import { JOURS_SEMAINE } from '@/lib/joursSemaine'
import { cycleForNiveau, type Cycle } from '@/lib/cycle'
import { colorForMatiere } from '@/lib/matiereColor'
import { cn } from '@/lib/utils'

type EntityType = 'classe' | 'professeur'

function formatHeure(hhmmss: string): string {
  return hhmmss.slice(0, 5)
}

function niveauLabel(niveauKey: string): string {
  return NIVEAUX_ETABLISSEMENT.find((n) => n.key === niveauKey)?.label ?? niveauKey
}

// Grille jours × créneaux pour UN cycle, filtrée soit sur une classe précise (niveau + section), soit sur
// un ensemble d'ids professeur (une même personne peut avoir plusieurs fiches — une par matière). Un
// professeur qui enseigne à la fois au collège et au lycée a donc une grille par cycle, chacune avec ses
// propres créneaux — sinon la moitié de son planning resterait invisible.
function CycleGrid({
  etablissementId,
  cycle,
  filter,
  profNameById,
}: {
  etablissementId: string
  cycle: Cycle
  filter: { niveau: string; section: number } | { professeurIds: string[] }
  profNameById: Record<string, string>
}) {
  const isClasseFilter = 'niveau' in filter
  const filterKey = isClasseFilter ? `${filter.niveau}-${filter.section}` : filter.professeurIds.join(',')

  const { data: creneaux } = useQuery({
    queryKey: ['planning_creneaux', etablissementId, cycle],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('creneaux_horaires')
        .select('*')
        .eq('etablissement_id', etablissementId)
        .eq('cycle', cycle)
        .order('heure_debut', { ascending: true })
      if (error) throw error
      return data
    },
  })

  const { data: contraintes } = useQuery({
    queryKey: ['planning_contraintes', etablissementId, cycle],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('horaires_contraintes')
        .select('jours_cours, couleur_matieres')
        .eq('etablissement_id', etablissementId)
        .eq('cycle', cycle)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })

  const jours = JOURS_SEMAINE.filter((j) => (contraintes?.jours_cours ?? []).includes(j.key))

  const { data: seances } = useQuery({
    queryKey: ['planning_emploi_du_temps', etablissementId, cycle, isClasseFilter ? 'classe' : 'professeur', filterKey],
    queryFn: async () => {
      let query = supabase.from('emploi_du_temps').select('*').eq('etablissement_id', etablissementId).eq('cycle', cycle)
      query = isClasseFilter
        ? query.eq('niveau', filter.niveau).eq('section', filter.section)
        : query.in('professeur_id', filter.professeurIds)
      const { data, error } = await query
      if (error) throw error
      return data
    },
  })

  const seanceParCase = new Map((seances ?? []).map((s) => [`${s.jour}|${s.creneau_id}`, s]))

  return (
    <div className="mb-8">
      {isClasseFilter && (
        <p className="mb-3 text-sm font-semibold text-foreground">
          NOMBRE HEURES DE COURS PAR SEMAINE = {(seances ?? []).length}H
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[640px] table-fixed border-collapse text-sm">
          <thead>
            <tr className="bg-secondary text-secondary-foreground">
              <th className="w-28 whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide">
                Horaires
              </th>
              {jours.map((j) => (
                <th key={j.key} className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide">
                  {j.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(creneaux ?? []).map((c) => {
              const isBreak = c.type !== 'cours'
              return (
                <tr key={c.id} className="border-t border-border">
                  <td className="whitespace-nowrap px-3 py-2 text-xs font-medium text-muted-foreground">
                    {formatHeure(c.heure_debut)} - {formatHeure(c.heure_fin)}
                  </td>
                  {isBreak ? (
                    <td
                      colSpan={jours.length}
                      className="bg-muted/50 px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                    >
                      {c.type === 'recreation' ? 'RÉCRÉATION' : 'DÉJEUNER'}
                    </td>
                  ) : (
                    jours.map((j) => {
                      const seance = seanceParCase.get(`${j.key}|${c.id}`)
                      return (
                        <td
                          key={j.key}
                          className="border-l border-border px-2 py-2 text-center text-xs"
                          style={
                            seance && contraintes?.couleur_matieres
                              ? { backgroundColor: colorForMatiere(seance.matiere) }
                              : undefined
                          }
                        >
                          {seance ? (
                            <div className="flex flex-col items-center gap-0.5">
                              {isClasseFilter ? (
                                <>
                                  <span className="font-medium text-foreground">{seance.matiere}</span>
                                  <span className="text-[11px] text-muted-foreground">
                                    {profNameById[seance.professeur_id] ?? ''}
                                  </span>
                                </>
                              ) : (
                                <>
                                  <span className="font-medium text-foreground">
                                    {niveauLabel(seance.niveau)} {seance.section}
                                  </span>
                                  <span className="text-[11px] text-muted-foreground">{seance.matiere}</span>
                                </>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground/40">—</span>
                          )}
                        </td>
                      )
                    })
                  )}
                </tr>
              )
            })}
            {(creneaux ?? []).length === 0 && (
              <tr>
                <td colSpan={jours.length + 1} className="px-3 py-6 text-center text-sm text-muted-foreground">
                  Aucun créneau horaire défini pour ce cycle — configure-les dans Paramètres {'>'} Horaires &amp;
                  contraintes.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {(creneaux ?? []).length > 0 && (seances ?? []).length === 0 && (
        <p className="mt-4 text-xs text-muted-foreground">
          Aucune séance générée pour cette sélection — lance la génération de l'emploi du temps depuis le{' '}
          <Link to="/dashboard" className="font-semibold text-primary underline">
            Dashboard
          </Link>
          .
        </p>
      )}
    </div>
  )
}

// Grille jours × créneaux pour un professeur, fusionnant tous ses cycles actifs (collège + lycée) en un
// seul planning — un professeur, un planning, même si l'établissement gère les deux cycles avec des
// grilles de créneaux distinctes en base. Les créneaux au même horaire réel (heure début/fin/type) dans
// plusieurs cycles ne comptent que pour une seule ligne ; les créneaux propres à un seul cycle gardent
// leur propre ligne.
function ProfesseurGrid({
  etablissementId,
  cycles,
  professeurIds,
}: {
  etablissementId: string
  cycles: Cycle[]
  professeurIds: string[]
}) {
  const cyclesKey = [...cycles].sort().join(',')

  const { data: creneaux } = useQuery({
    queryKey: ['planning_creneaux_multi', etablissementId, cyclesKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('creneaux_horaires')
        .select('*')
        .eq('etablissement_id', etablissementId)
        .in('cycle', cycles)
        .order('heure_debut', { ascending: true })
      if (error) throw error
      return data
    },
  })

  const { data: contraintesRows } = useQuery({
    queryKey: ['planning_contraintes_multi', etablissementId, cyclesKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('horaires_contraintes')
        .select('cycle, jours_cours, couleur_matieres')
        .eq('etablissement_id', etablissementId)
        .in('cycle', cycles)
      if (error) throw error
      return data
    },
  })

  const jours = JOURS_SEMAINE.filter((j) => (contraintesRows ?? []).some((c) => c.jours_cours.includes(j.key)))
  const couleurMatieres = (contraintesRows ?? []).some((c) => c.couleur_matieres)

  // Une ligne par horaire réel distinct (heure début/fin/type) — un même horaire présent dans plusieurs
  // cycles n'est affiché qu'une fois, en gardant l'id de créneau de chaque cycle pour la recherche des
  // séances.
  const rowsMap = new Map<string, { heureDebut: string; heureFin: string; type: string; idsByCycle: Partial<Record<Cycle, string>> }>()
  for (const c of creneaux ?? []) {
    const key = `${c.heure_debut}|${c.heure_fin}|${c.type}`
    const row = rowsMap.get(key) ?? { heureDebut: c.heure_debut, heureFin: c.heure_fin, type: c.type, idsByCycle: {} }
    row.idsByCycle[c.cycle as Cycle] = c.id
    rowsMap.set(key, row)
  }
  const rows = [...rowsMap.values()].sort((a, b) => a.heureDebut.localeCompare(b.heureDebut))

  const { data: seances } = useQuery({
    queryKey: ['planning_emploi_du_temps_multi', etablissementId, cyclesKey, professeurIds.join(',')],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('emploi_du_temps')
        .select('*')
        .eq('etablissement_id', etablissementId)
        .in('cycle', cycles)
        .in('professeur_id', professeurIds)
      if (error) throw error
      return data
    },
  })

  const seanceByJourCreneau = new Map((seances ?? []).map((s) => [`${s.jour}|${s.creneau_id}`, s]))

  function seanceForRow(jourKey: string, row: (typeof rows)[number]) {
    for (const cycle of cycles) {
      const creneauId = row.idsByCycle[cycle]
      if (!creneauId) continue
      const seance = seanceByJourCreneau.get(`${jourKey}|${creneauId}`)
      if (seance) return seance
    }
    return undefined
  }

  return (
    <div className="mb-8">
      <p className="mb-3 text-sm font-semibold text-foreground">HEURES = {(seances ?? []).length}H</p>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[640px] table-fixed border-collapse text-sm">
          <thead>
            <tr className="bg-secondary text-secondary-foreground">
              <th className="w-28 whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide">
                Horaires
              </th>
              {jours.map((j) => (
                <th key={j.key} className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide">
                  {j.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isBreak = row.type !== 'cours'
              return (
                <tr key={`${row.heureDebut}-${row.heureFin}-${row.type}`} className="border-t border-border">
                  <td className="whitespace-nowrap px-3 py-2 text-xs font-medium text-muted-foreground">
                    {formatHeure(row.heureDebut)} - {formatHeure(row.heureFin)}
                  </td>
                  {isBreak ? (
                    <td
                      colSpan={jours.length}
                      className="bg-muted/50 px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                    >
                      {row.type === 'recreation' ? 'RÉCRÉATION' : 'DÉJEUNER'}
                    </td>
                  ) : (
                    jours.map((j) => {
                      const seance = seanceForRow(j.key, row)
                      return (
                        <td
                          key={j.key}
                          className="border-l border-border px-2 py-2 text-center text-xs"
                          style={seance && couleurMatieres ? { backgroundColor: colorForMatiere(seance.matiere) } : undefined}
                        >
                          {seance ? (
                            <div className="flex flex-col items-center gap-0.5">
                              <span className="font-medium text-foreground">
                                {niveauLabel(seance.niveau)} {seance.section}
                              </span>
                              <span className="text-[11px] text-muted-foreground">{seance.matiere}</span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground/40">—</span>
                          )}
                        </td>
                      )
                    })
                  )}
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={jours.length + 1} className="px-3 py-6 text-center text-sm text-muted-foreground">
                  Aucun créneau horaire défini — configure-les dans Paramètres {'>'} Horaires &amp; contraintes.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {rows.length > 0 && (seances ?? []).length === 0 && (
        <p className="mt-4 text-xs text-muted-foreground">
          Aucune séance générée pour cette sélection — lance la génération de l'emploi du temps depuis le{' '}
          <Link to="/dashboard" className="font-semibold text-primary underline">
            Dashboard
          </Link>
          .
        </p>
      )}
    </div>
  )
}

export function Planning() {
  const { data: profile } = useProfile()
  const etablissementId = profile?.etablissement_id ?? null

  const [entityType, setEntityType] = useState<EntityType>('classe')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  const { data: classesConfig } = useQuery({
    queryKey: ['planning_classes', etablissementId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('classes_etablissement')
        .select('niveau, nombre_classes')
        .eq('etablissement_id', etablissementId!)
        .order('niveau', { ascending: true })
      if (error) throw error
      return data
    },
    enabled: !!etablissementId,
  })

  const { data: professeurs } = useQuery({
    queryKey: ['planning_professeurs', etablissementId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('professeurs')
        .select('id, nom_complet, niveaux')
        .eq('etablissement_id', etablissementId!)
        .order('nom_complet', { ascending: true })
      if (error) throw error
      return data
    },
    enabled: !!etablissementId,
  })

  const classeOptions = (classesConfig ?? []).flatMap((c) => {
    const niveau = NIVEAUX_ETABLISSEMENT.find((n) => n.key === c.niveau)
    if (!niveau) return []
    return Array.from({ length: c.nombre_classes }, (_, i) => i + 1).map((section) => ({
      key: `${c.niveau}-${section}`,
      label: `${niveau.label} ${section}`,
      niveau: c.niveau,
      section,
    }))
  })

  // Un professeur qui enseigne plusieurs matières a plusieurs lignes (une par matière) — on les regroupe
  // par nom pour ne proposer qu'une seule sélection par personne, avec son planning combiné. On garde
  // aussi tous les niveaux de toutes ses lignes pour savoir dans quel(s) cycle(s) elle enseigne : une
  // grille par cycle actif (voir CycleGrid), sinon la moitié du planning d'un prof à cheval collège/lycée
  // resterait invisible.
  const professeurIdsParNom = new Map<string, string[]>()
  const professeurCyclesParNom = new Map<string, Set<Cycle>>()
  for (const p of professeurs ?? []) {
    professeurIdsParNom.set(p.nom_complet, [...(professeurIdsParNom.get(p.nom_complet) ?? []), p.id])
    const cycles = professeurCyclesParNom.get(p.nom_complet) ?? new Set<Cycle>()
    for (const code of p.niveaux) cycles.add(cycleForNiveau(code.split('-')[0]))
    professeurCyclesParNom.set(p.nom_complet, cycles)
  }

  const professeurOptions = [...professeurIdsParNom.keys()]
    .map((nom) => ({ key: nom, label: nom }))
    .sort((a, b) => a.label.localeCompare(b.label))

  const profNameById = Object.fromEntries((professeurs ?? []).map((p) => [p.id, p.nom_complet]))

  const options = entityType === 'classe' ? classeOptions : professeurOptions
  const selectedClasse = entityType === 'classe' ? classeOptions.find((o) => o.key === selectedKey) ?? null : null
  const selectedProfesseur = entityType === 'professeur' ? professeurOptions.find((o) => o.key === selectedKey) ?? null : null
  const selected = entityType === 'classe' ? selectedClasse : selectedProfesseur

  useEffect(() => {
    setSelectedKey(null)
  }, [entityType])

  const classeCycle = selectedClasse ? cycleForNiveau(selectedClasse.niveau) : null
  const professeurCycles = selectedProfesseur
    ? [...(professeurCyclesParNom.get(selectedProfesseur.key) ?? [])].sort()
    : []

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppHeader />

      <main className="mx-auto max-w-5xl p-8">
        <div className="mb-2 text-xs font-semibold uppercase tracking-[1.5px] text-primary">Emploi du temps</div>
        <h1 className="mb-6 font-serif text-3xl font-semibold text-foreground">
          {selected ? selected.label : 'Sélectionne une classe ou un professeur'}
        </h1>

        <div className="mb-5 inline-flex gap-1 rounded-lg border border-border bg-card p-1">
          {(
            [
              { key: 'classe', label: 'Classe' },
              { key: 'professeur', label: 'Professeur' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setEntityType(tab.key)}
              className={cn(
                'rounded-md px-4 py-2 text-sm font-semibold transition-colors',
                entityType === tab.key
                  ? 'bg-secondary text-secondary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="mb-6 flex flex-wrap gap-1.5">
          {options.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {entityType === 'classe'
                ? "Aucune classe configurée — renseigne-les dans Paramètres > Classes."
                : 'Aucun professeur configuré — renseigne-les dans Paramètres > Professeurs.'}
            </p>
          )}
          {options.map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => setSelectedKey(o.key)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                selectedKey === o.key
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card text-muted-foreground hover:text-foreground',
              )}
            >
              {o.label}
            </button>
          ))}
        </div>

        {etablissementId && selectedClasse && classeCycle && (
          <CycleGrid
            etablissementId={etablissementId}
            cycle={classeCycle}
            filter={{ niveau: selectedClasse.niveau, section: selectedClasse.section }}
            profNameById={profNameById}
          />
        )}

        {etablissementId && selectedProfesseur && professeurCycles.length > 0 && (
          <ProfesseurGrid
            etablissementId={etablissementId}
            cycles={professeurCycles}
            professeurIds={professeurIdsParNom.get(selectedProfesseur.key) ?? []}
          />
        )}
      </main>
    </div>
  )
}
