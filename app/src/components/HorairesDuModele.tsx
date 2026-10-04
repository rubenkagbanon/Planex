import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EMPLOI_DU_TEMPS_QUERY_KEY, type EmploiDuTempsData } from '@/hooks/useEmploiDuTempsData'
import { horairesDuModele, type CreneauPropose } from '@/lib/apprentissage'
import { enregistrerHorairesCycle } from '@/lib/horairesApplication'
import type { Cycle } from '@/lib/cycle'
import type { LigneVersion } from '@/lib/importEdtPdf'
import { JOURS_SEMAINE } from '@/lib/joursSemaine'
import { cn } from '@/lib/utils'

const CYCLE_LABEL: Record<Cycle, string> = { college: 'Collège', lycee: 'Lycée' }
const TYPE_LABEL: Record<CreneauPropose['type'], string> = { cours: 'Cours', recreation: 'Récréation', dejeuner: 'Déjeuner' }
const h = (hhmmss: string) => hhmmss.slice(0, 5).replace(':', 'h')
const cle = (c: { heure_debut?: string; heureDebut?: string; heure_fin?: string; heureFin?: string; type: string }) =>
  `${(c.heure_debut ?? c.heureDebut ?? '').slice(0, 5)}|${(c.heure_fin ?? c.heureFin ?? '').slice(0, 5)}|${c.type}`

// Horaires lus dans l'emploi du temps modèle (jours, créneaux, pauses), comparés à ceux configurés dans
// Planex, avec la possibilité de les reprendre tels quels.
export function HorairesDuModele({ lignes, data, etablissementId }: { lignes: LigneVersion[]; data: EmploiDuTempsData; etablissementId: string }) {
  const queryClient = useQueryClient()
  const [confirme, setConfirme] = useState(false)
  const [fait, setFait] = useState(false)

  const horaires = useMemo(
    () => horairesDuModele(lignes.map((l) => ({ cycle: l.cycle as Cycle, jour: l.jour, heureDebut: l.heure_debut, heureFin: l.heure_fin }))),
    [lignes],
  )

  // Comparaison avec la configuration actuelle, cycle par cycle
  const comparaison = horaires.map((hm) => {
    const actuels = data.creneaux.filter((c) => c.cycle === hm.cycle)
    const contrainte = data.contraintes.find((c) => c.cycle === hm.cycle)
    const proposes = new Set(hm.creneaux.map(cle))
    const aSupprimer = actuels.filter((c) => !proposes.has(cle(c)))
    const existants = new Set(actuels.map(cle))
    const aAjouter = hm.creneaux.filter((c) => !existants.has(cle(c)))
    const joursIdentiques = !!contrainte && [...contrainte.jours_cours].sort().join() === [...hm.jours].sort().join()
    const mercrediIdentique = !!contrainte && contrainte.mercredi_apres_midi_banalise === hm.mercrediApresMidiBanalise
    const idsSupprimes = new Set(aSupprimer.map((c) => c.id))
    const seancesPerdues = data.seances.filter((s) => idsSupprimes.has(s.creneau_id)).length
    const identique = aSupprimer.length === 0 && aAjouter.length === 0 && joursIdentiques && mercrediIdentique
    return { hm, actuels, aSupprimer, aAjouter, identique, seancesPerdues }
  })
  const aAppliquer = comparaison.filter((c) => !c.identique)
  const seancesPerdues = aAppliquer.reduce((s, c) => s + c.seancesPerdues, 0)
  const aucunCreneau = data.creneaux.length === 0

  const appliquer = useMutation({
    mutationFn: async () => {
      for (const { hm, aSupprimer, aAjouter } of aAppliquer) {
        await enregistrerHorairesCycle(etablissementId, hm, aSupprimer.map((c) => c.id), aAjouter)
      }
    },
    onSuccess: () => {
      setFait(true)
      setConfirme(false)
      queryClient.invalidateQueries({ queryKey: [EMPLOI_DU_TEMPS_QUERY_KEY] })
      queryClient.invalidateQueries({ queryKey: ['creneaux_horaires'] })
      queryClient.invalidateQueries({ queryKey: ['horaires_contraintes'] })
      queryClient.invalidateQueries({ queryKey: ['horaires_contraintes_cycles'] })
    },
  })

  if (horaires.length === 0) return null

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-start justify-between gap-3 px-6 pb-3 pt-5">
        <div>
          <h3 className="flex items-center gap-2 font-serif text-base font-semibold text-foreground">
            <Clock className="h-4 w-4 text-primary" /> Horaires de ce modèle
          </h3>
          <p className="text-xs text-muted-foreground">
            Jours et heures de cours relevés dans l'emploi du temps importé ; les pauses sont déduites des trous entre deux
            cours (le plus long avant l'après-midi est le déjeuner).
          </p>
        </div>
        {aAppliquer.length === 0 ? (
          <span className="flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground">
            <Check className="h-3.5 w-3.5" /> Ce sont déjà les horaires de Planex
          </span>
        ) : aucunCreneau ? (
          <span className="rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold text-primary">Aucun horaire configuré dans Planex</span>
        ) : (
          <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold text-foreground">Différents des horaires de Planex</span>
        )}
      </div>

      <div className={cn('grid gap-4 border-t border-border px-6 py-4', horaires.length > 1 && 'md:grid-cols-2')}>
        {comparaison.map(({ hm, identique, actuels }) => (
          <div key={hm.cycle}>
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-foreground">{CYCLE_LABEL[hm.cycle]}</span>
              <span className="text-[11px] text-muted-foreground">
                {identique ? 'identiques à Planex' : actuels.length === 0 ? 'à créer' : 'à mettre à jour'}
              </span>
            </div>
            <div className="mb-2 flex flex-wrap gap-1">
              {JOURS_SEMAINE.filter((j) => hm.jours.includes(j.key)).map((j) => (
                <span key={j.key} className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">
                  {j.label}
                </span>
              ))}
              {hm.mercrediApresMidiBanalise && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-foreground">Mercredi après-midi libre</span>
              )}
            </div>
            <div className="overflow-hidden rounded-lg border border-border">
              {hm.creneaux.map((c) => (
                <div
                  key={cle(c)}
                  className={cn(
                    'flex items-center justify-between border-t border-border px-3 py-1.5 text-xs first:border-t-0',
                    c.type !== 'cours' && 'bg-muted/50 text-muted-foreground',
                  )}
                >
                  <span className="tabular-nums">
                    {h(c.heureDebut)} – {h(c.heureFin)}
                  </span>
                  <span className={cn(c.type !== 'cours' && 'font-semibold uppercase tracking-wide')}>{TYPE_LABEL[c.type]}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {aAppliquer.length > 0 && (
        <div className="space-y-3 border-t border-border px-6 py-4">
          {seancesPerdues > 0 && (
            <label className="flex items-start gap-2 text-xs text-destructive">
              <input type="checkbox" className="mt-0.5" checked={confirme} onChange={(e) => setConfirme(e.target.checked)} />
              <span>
                {seancesPerdues} séance{seancesPerdues > 1 ? 's' : ''} de l'emploi du temps actuel {seancesPerdues > 1 ? 'sont placées' : 'est placée'} sur
                des créneaux qui disparaîtront et {seancesPerdues > 1 ? 'seront supprimées' : 'sera supprimée'} : il faudra régénérer. Je confirme.
              </span>
            </label>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" disabled={appliquer.isPending || (seancesPerdues > 0 && !confirme)} onClick={() => appliquer.mutate()}>
              {appliquer.isPending ? 'Enregistrement…' : 'Utiliser ces horaires dans Planex'}
            </Button>
            <span className="text-xs text-muted-foreground">
              Les créneaux identiques sont conservés ; tu pourras tout ajuster ensuite dans{' '}
              <Link to="/parametres-contraintes" className="font-semibold text-primary underline">
                Horaires & contraintes
              </Link>
              .
            </span>
          </div>
          {appliquer.isError && (
            <p className="text-xs text-destructive">{appliquer.error instanceof Error ? appliquer.error.message : 'Échec de l’enregistrement.'}</p>
          )}
        </div>
      )}
      {fait && aAppliquer.length === 0 && (
        <p className="border-t border-border px-6 py-3 text-xs text-primary">
          Horaires enregistrés. Ils apparaissent dans Paramètres › Horaires & contraintes.
        </p>
      )}
    </div>
  )
}
