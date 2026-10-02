import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useProfile } from '@/hooks/useProfile'
import { useEmploiDuTempsData, type EmploiDuTempsData } from '@/hooks/useEmploiDuTempsData'
import { AppHeader } from '@/components/AppHeader'
import type { Cycle } from '@/lib/cycle'
import { REGLES_DESCRIPTIONS, type ReglesPedagogiques } from '@/lib/regles'
import { analyserEntorses, groupSlotsByJour, type Entorse } from '@/lib/scheduling/entorses'
import { normalizeProfesseurNom } from '@/lib/scheduling/solver'
import {
  abregerMatiere,
  classeLabel,
  construireLignes,
  estVieScolaire,
  formatHeure,
  joursActifs,
  seancesDeCase,
} from '@/lib/timetable'
import { colorForMatiere } from '@/lib/matiereColor'
import { cn } from '@/lib/utils'
import { Comparaison } from '@/components/Comparaison'
import { useHorairesGrid } from '@/hooks/useHorairesGrid'
import { volumeFicheMinutes } from '@/lib/volumeFiche'

type Onglet = 'classes' | 'salles' | 'controles' | 'services' | 'rapport' | 'comparaison'

function initiales(nom: string): string {
  return nom.split(/\s+/)[0] ?? nom
}

function GrilleClasses({ data, jour }: { data: EmploiDuTempsData; jour: string }) {
  const cycles = (['college', 'lycee'] as Cycle[]).filter((cycle) => data.classeOptions.some((c) => c.cycle === cycle))
  return (
    <div className="flex flex-col gap-8">
      {cycles.map((cycle) => {
        const lignes = construireLignes(data.creneaux, [cycle]).filter((l) => l.type === 'cours')
        const classes = data.classeOptions.filter((c) => c.cycle === cycle)
        return (
          <div key={cycle}>
            <h3 className="mb-2 font-serif text-lg font-semibold">{cycle === 'college' ? 'Collège' : 'Lycée'}</h3>
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[800px] border-collapse text-[11px]">
                <thead>
                  <tr className="bg-secondary text-secondary-foreground">
                    <th className="sticky left-0 bg-secondary px-2 py-1.5 text-left">Classe</th>
                    {lignes.map((l) => (
                      <th key={l.key} className="px-1 py-1.5 font-semibold">
                        {formatHeure(l.heureDebut)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {classes.map((c) => {
                    const seances = data.seances.filter((s) => s.niveau === c.niveau && s.section === c.section)
                    return (
                      <tr key={c.key} className="border-t border-border">
                        <td className="sticky left-0 whitespace-nowrap bg-card px-2 py-1 font-semibold">{c.label}</td>
                        {lignes.map((l) => {
                          if (estVieScolaire(jour, l, data.contraintes, data.creneaux, [cycle])) {
                            return <td key={l.key} className="border-l border-border bg-muted/40 text-center text-[9px] text-muted-foreground">VS</td>
                          }
                          const contenu = seancesDeCase(seances, jour, l)
                          return (
                            <td
                              key={l.key}
                              className="border-l border-border px-1 py-1 text-center"
                              style={contenu[0] ? { backgroundColor: colorForMatiere(contenu[0].matiere) } : undefined}
                              title={contenu.map((s) => `${s.matiere} — ${data.profNameById[s.professeur_id] ?? ''}`).join('\n')}
                            >
                              {contenu.length > 0 && (
                                <>
                                  <div className="font-semibold">{[...new Set(contenu.map((s) => abregerMatiere(s.matiere)))].join('/')}</div>
                                  <div className="text-[9px] text-foreground/70">{contenu.map((s) => initiales(data.profNameById[s.professeur_id] ?? '')).join('/')}</div>
                                </>
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
          </div>
        )
      })}
    </div>
  )
}

function GrilleSalles({ data, jour }: { data: EmploiDuTempsData; jour: string }) {
  if (data.salles.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Aucune salle saisie (facultatif) — voir{' '}
        <Link to="/parametres-salles" className="font-semibold text-primary underline">
          Paramètres &gt; Salles
        </Link>
        .
      </p>
    )
  }
  const cycles = ['college', 'lycee'].filter((cycle) => data.contraintes.some((c) => c.cycle === cycle)) as Cycle[]
  const lignes = construireLignes(data.creneaux, cycles).filter((l) => l.type === 'cours')
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[800px] border-collapse text-[11px]">
        <thead>
          <tr className="bg-secondary text-secondary-foreground">
            <th className="px-2 py-1.5 text-left">Salle</th>
            {lignes.map((l) => (
              <th key={l.key} className="px-1 py-1.5">
                {formatHeure(l.heureDebut)}
              </th>
            ))}
            <th className="px-2 py-1.5">Occupation</th>
          </tr>
        </thead>
        <tbody>
          {data.salles.map((salle) => {
            const seances = data.seances.filter((s) => s.salle_id === salle.id)
            const occupees = lignes.filter((l) => seancesDeCase(seances, jour, l).length > 0).length
            return (
              <tr key={salle.id} className="border-t border-border">
                <td className="whitespace-nowrap px-2 py-1 font-semibold">
                  {salle.nom}
                  {salle.capacite > 1 && <span className="ml-1 text-[9px] font-normal text-muted-foreground">(×{salle.capacite})</span>}
                </td>
                {lignes.map((l) => {
                  const contenu = seancesDeCase(seances, jour, l)
                  return (
                    <td key={l.key} className={cn('border-l border-border px-1 py-1 text-center', contenu.length > 0 && 'bg-primary/15')}>
                      {[...new Set(contenu.map((s) => classeLabel(s.niveau, s.section)))].join(', ')}
                    </td>
                  )
                })}
                <td className="border-l border-border px-2 text-center">
                  {lignes.length > 0 ? Math.round((occupees / lignes.length) * 100) : 0} %
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function Controles({ entorses }: { entorses: Entorse[] }) {
  const parRegle = new Map<keyof ReglesPedagogiques, Entorse[]>()
  for (const e of entorses) parRegle.set(e.regle, [...(parRegle.get(e.regle) ?? []), e])
  if (entorses.length === 0) {
    return <p className="rounded-xl border border-border bg-card p-5 text-sm text-primary">Aucune entorse aux règles pédagogiques actives.</p>
  }
  return (
    <div className="flex flex-col gap-4">
      {REGLES_DESCRIPTIONS.filter((r) => parRegle.has(r.key)).map((regle) => {
        const liste = parRegle.get(regle.key)!
        return (
          <details key={regle.key} className="rounded-xl border border-border bg-card p-4" open={liste.length <= 10}>
            <summary className="cursor-pointer text-sm font-semibold">
              {regle.titre} — {liste.length} cas
            </summary>
            <ul className="mt-2 max-h-64 list-disc overflow-y-auto pl-5 text-xs text-muted-foreground">
              {liste.map((e, i) => (
                <li key={i}>{e.detail}</li>
              ))}
            </ul>
          </details>
        )
      })}
    </div>
  )
}

function Services({ data, grid }: { data: EmploiDuTempsData; grid: Record<string, Record<string, string>> }) {
  const nombreClassesParNiveau: Record<string, number> = {}
  for (const c of data.classeOptions) nombreClassesParNiveau[c.niveau] = (nombreClassesParNiveau[c.niveau] ?? 0) + 1
  const lignes = [...data.professeurIdsParNom.entries()]
    .map(([nom, ids]) => {
      const idSet = new Set(ids)
      const fiches = data.professeurs.filter((p) => idSet.has(p.id))
      const dues = fiches.reduce((sum, p) => sum + volumeFicheMinutes(p, nombreClassesParNiveau, grid), 0) / 60
      const seances = data.seances.filter((s) => idSet.has(s.professeur_id))
      // Heures-classe : chaque classe servie compte (un tronc commun de 2 classes = 2 h pour 1 h de présence),
      // comparables aux heures dues, calculées classe par classe depuis la fiche.
      const placees = new Set(seances.map((s) => `${s.jour}|${s.creneau_id}|${s.niveau}-${s.section}`)).size
      // Présence : créneaux où le professeur est réellement devant des élèves
      const presence = new Set(seances.map((s) => `${s.jour}|${s.creneau_id}`)).size
      const parCreneau = new Map<string, Set<string>>()
      for (const s of seances) {
        const k = `${s.jour}|${s.creneau_id}`
        parCreneau.set(k, (parCreneau.get(k) ?? new Set()).add(`${s.niveau}-${s.section}`))
      }
      const troncCommun = [...parCreneau.values()].filter((classes) => classes.size > 1).length
      return { nom, matieres: [...new Set(fiches.map((f) => f.matiere))].join(', '), dues, placees, presence, troncCommun }
    })
    .sort((a, b) => Math.abs(b.placees - b.dues) - Math.abs(a.placees - a.dues) || a.nom.localeCompare(b.nom))
  const ecarts = lignes.filter((l) => Math.round(l.placees - l.dues) !== 0).length
  return (
    <div>
      <p className="mb-3 text-sm text-muted-foreground">
        Heures dues = volume de chaque fiche (Paramètres &gt; Professeurs), calculé classe par classe depuis la grille horaire de référence.
        Heures placées = heures de chaque classe dans l'emploi du temps, comparées aux heures dues. Présence = temps réel du professeur devant les
        élèves : en tronc commun, il encadre plusieurs classes à la fois, une heure de présence vaut donc plusieurs heures-classe.{' '}
        <strong className="text-foreground">{ecarts} professeur(s) avec un écart.</strong>
      </p>
      <div className="overflow-hidden rounded-xl border border-border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-secondary text-secondary-foreground">
              <th className="px-3 py-2 text-left text-xs uppercase">Professeur</th>
              <th className="px-3 py-2 text-left text-xs uppercase">Discipline(s)</th>
              <th className="px-3 py-2 text-center text-xs uppercase">Dues</th>
              <th className="px-3 py-2 text-center text-xs uppercase">Placées</th>
              <th className="px-3 py-2 text-center text-xs uppercase">Écart</th>
              <th className="px-3 py-2 text-center text-xs uppercase">Présence</th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((l, i) => {
              const ecart = Math.round((l.placees - l.dues) * 10) / 10
              return (
                <tr key={l.nom} className={cn('border-t border-border', i % 2 === 0 ? 'bg-card' : 'bg-background')}>
                  <td className="px-3 py-1.5 font-medium">{l.nom}</td>
                  <td className="px-3 py-1.5 text-muted-foreground">{l.matieres}</td>
                  <td className="px-3 py-1.5 text-center">{Math.round(l.dues * 10) / 10}h</td>
                  <td className="px-3 py-1.5 text-center">{l.placees}h</td>
                  <td className={cn('px-3 py-1.5 text-center font-semibold', ecart < 0 ? 'text-destructive' : ecart > 0 ? 'text-primary' : 'text-[#2F6F52]')}>
                    {ecart === 0 ? '✓' : `${ecart > 0 ? '+' : ''}${ecart}h`}
                  </td>
                  <td className="px-3 py-1.5 text-center">
                    {l.presence}h
                    {l.troncCommun > 0 && (
                      <div className="text-[11px] text-muted-foreground">dont {l.troncCommun}h en tronc commun</div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Rapport({ etablissementId }: { etablissementId: string }) {
  const { data: rapport } = useQuery({
    queryKey: ['dernier_rapport', etablissementId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('generations')
        .select('*')
        .eq('etablissement_id', etablissementId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })
  if (!rapport) return <p className="text-sm text-muted-foreground">Aucune génération enregistrée pour l'instant.</p>
  const warnings = (rapport.warnings as string[]) ?? []
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <p className="mb-2 text-sm">
        Génération du {new Date(rapport.created_at).toLocaleString('fr-FR')} : <strong>{rapport.total_placees}/{rapport.total_charges}</strong> séances
        placées{rapport.nb_verrouillees > 0 && `, dont ${rapport.nb_verrouillees} verrouillées conservées`}.
      </p>
      {warnings.length > 0 ? (
        <ul className="max-h-96 list-disc overflow-y-auto pl-5 text-xs text-muted-foreground">
          {warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-primary">Aucun avertissement.</p>
      )}
    </div>
  )
}

export function VueEnsemble() {
  const { data: profile } = useProfile()
  const etablissementId = profile?.etablissement_id ?? null
  const { data } = useEmploiDuTempsData(etablissementId)
  const { grid } = useHorairesGrid(etablissementId)
  const [onglet, setOnglet] = useState<Onglet>('classes')
  const [jour, setJour] = useState('lundi')

  const entorses = useMemo(() => {
    if (!data) return []
    return analyserEntorses(
      data.seances.map((s) => ({ niveau: s.niveau, section: s.section, matiere: s.matiere, cycle: s.cycle as Cycle, jour: s.jour, creneauId: s.creneau_id })),
      { college: groupSlotsByJour(data.slotsByCycle.college), lycee: groupSlotsByJour(data.slotsByCycle.lycee) },
      data.reglesByCycle,
    )
  }, [data])

  const jours = data ? joursActifs(data.contraintes, ['college', 'lycee']) : []

  // Garde-fou : conflits éventuels (ne devraient jamais exister grâce à la base, affichés par sécurité).
  const conflitsProf = useMemo(() => {
    if (!data) return 0
    const vus = new Map<string, string | null>()
    let conflits = 0
    const heure = new Map(data.creneaux.map((c) => [c.id, `${c.heure_debut}-${c.heure_fin}`]))
    for (const s of data.seances) {
      const key = `${normalizeProfesseurNom(data.profNameById[s.professeur_id] ?? '')}|${s.jour}|${heure.get(s.creneau_id)}`
      if (vus.has(key) && (vus.get(key) === null || vus.get(key) !== s.groupe_seance)) conflits++
      vus.set(key, s.groupe_seance)
    }
    return conflits
  }, [data])

  const onglets: { key: Onglet; label: string }[] = [
    { key: 'classes', label: 'Toutes les classes' },
    { key: 'salles', label: 'Salles' },
    { key: 'controles', label: `Contrôles pédagogiques (${entorses.length})` },
    { key: 'services', label: 'Services des professeurs' },
    { key: 'rapport', label: 'Dernier rapport' },
    { key: 'comparaison', label: 'Comparer' },
  ]

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppHeader />
      <main className="mx-auto max-w-7xl p-8">
        <div className="mb-2 text-xs font-semibold uppercase tracking-[1.5px] text-primary">Vue d'ensemble</div>
        <h1 className="mb-2 font-serif text-3xl font-semibold">Tableau de bord du censeur</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          {data ? `${data.seances.length} séances · ${data.classeOptions.length} classes · ${data.professeurIdsParNom.size} professeurs` : 'Chargement...'}
          {conflitsProf > 0 && <span className="ml-2 font-semibold text-destructive">{conflitsProf} conflit(s) de professeur détecté(s)</span>}
        </p>

        <div className="mb-6 flex flex-wrap gap-1 border-b border-border">
          {onglets.map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => setOnglet(o.key)}
              className={cn(
                'whitespace-nowrap border-b-2 px-4 py-2 text-sm font-semibold transition-colors',
                onglet === o.key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {o.label}
            </button>
          ))}
        </div>

        {(onglet === 'classes' || onglet === 'salles') && (
          <div className="mb-4 flex flex-wrap gap-1.5">
            {jours.map((j) => (
              <button
                key={j.key}
                type="button"
                onClick={() => setJour(j.key)}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-medium',
                  jour === j.key ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:text-foreground',
                )}
              >
                {j.label}
              </button>
            ))}
          </div>
        )}

        {data && onglet === 'classes' && <GrilleClasses data={data} jour={jour} />}
        {data && onglet === 'salles' && <GrilleSalles data={data} jour={jour} />}
        {data && onglet === 'controles' && <Controles entorses={entorses} />}
        {data && onglet === 'services' && <Services data={data} grid={grid} />}
        {etablissementId && onglet === 'rapport' && <Rapport etablissementId={etablissementId} />}
        {data && etablissementId && onglet === 'comparaison' && <Comparaison data={data} etablissementId={etablissementId} />}
      </main>
    </div>
  )
}
