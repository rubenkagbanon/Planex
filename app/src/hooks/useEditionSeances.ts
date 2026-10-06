import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { EMPLOI_DU_TEMPS_QUERY_KEY, type EmploiDuTempsData } from '@/hooks/useEmploiDuTempsData'
import type { Cycle } from '@/lib/cycle'
import { calculerPermutation, reaffecterSalles, verifierDeplacements, type Deplacement, type Mouvement } from '@/lib/edition'
import { analyserEntorses, groupSlotsByJour } from '@/lib/scheduling/entorses'
import { estVieScolaire, seancesDeCase, type GrilleLigne, type SeanceRow } from '@/lib/timetable'
import type { Json } from '@/lib/database.types'

export interface MessageEdition {
  type: 'erreur' | 'info'
  lignes: string[]
}

interface Retour {
  libelle: string
  positions: Deplacement[]
}

// Grille dans laquelle a lieu le glisser-déposer : une classe ou un professeur.
export interface CibleEdition {
  type: 'classe' | 'professeur' | 'salle'
  label: string
  filtre: (s: SeanceRow) => boolean
  // Toutes les lignes de la grille, pauses comprises (pour reconnaître les séances de plusieurs heures)
  lignes: GrilleLigne[]
  // Déplacer d'un coup toutes les heures d'une séance de plusieurs heures (sinon heure par heure)
  enBloc: boolean
}

export interface CaseGrille {
  jour: string
  ligne: GrilleLigne
}

// Déplacement manuel des séances (glisser-déposer), partagé par l'emploi du temps et la vue d'ensemble :
// contrôle des conflits, réaffectation des salles, verrouillage, avertissements pédagogiques et annulation.
export function useEditionSeances(data: EmploiDuTempsData | undefined, etablissementId: string | null) {
  const queryClient = useQueryClient()
  const [message, setMessage] = useState<MessageEdition | null>(null)
  const [historique, setHistorique] = useState<Retour[]>([])

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

  function deplacer(selection: CibleEdition, source: CaseGrille, cible: CaseGrille) {
    if (!data) return
    const { lignes } = selection
    const seances = data.seances.filter(selection.filtre)
    const contenuSource = seancesDeCase(seances, source.jour, source.ligne)
    if (contenuSource.length === 0) return
    // Cycle de la séance déplacée : dans la vue professeur, la grille peut mêler collège et lycée.
    const cycle = contenuSource[0].cycle as Cycle
    const premierCreneau = (ligne: GrilleLigne) => ligne.idsByCycle[cycle] ?? Object.values(ligne.idsByCycle).find(Boolean)
    const iSource = lignes.findIndex((l) => l.key === source.ligne.key)
    const iCible = lignes.findIndex((l) => l.key === cible.ligne.key)
    if (iSource < 0 || iCible < 0) return

    // Séance de plusieurs heures (ex. le bloc de 2h d'une matière en 2 + 1 + 1) : les cases voisines, sans
    // pause entre elles, qui ont le même contenu (matière, professeur, classe) bougent ensemble.
    const signature = (jour: string, i: number) =>
      seancesDeCase(seances, jour, lignes[i])
        .map((s) => `${s.matiere}|${s.professeur_id}|${s.niveau}-${s.section}`)
        .sort()
        .join(',')
    const signatureSource = signature(source.jour, iSource)
    let debut = iSource
    let fin = iSource
    while (selection.enBloc && debut > 0 && lignes[debut - 1].type === 'cours' && signature(source.jour, debut - 1) === signatureSource) debut--
    while (selection.enBloc && fin < lignes.length - 1 && lignes[fin + 1].type === 'cours' && signature(source.jour, fin + 1) === signatureSource) fin++
    const taille = fin - debut + 1
    // La case saisie garde sa place dans le bloc : glisser la 2e heure sur 10h place le bloc à 9h-11h.
    const debutCible = iCible - (iSource - debut)
    const positionsSource = Array.from({ length: taille }, (_, k) => debut + k)
    const positionsCible = Array.from({ length: taille }, (_, k) => debutCible + k)
    if (cible.jour === source.jour && debutCible === debut) return
    if (positionsCible.some((i) => lignes[i]?.type !== 'cours')) {
      setMessage({ type: 'erreur', lignes: [`Séance de ${taille}h : il faut ${taille} créneaux consécutifs, sans pause, à cet endroit.`] })
      return
    }
    if (positionsCible.some((i) => estVieScolaire(cible.jour, lignes[i], data.contraintes, data.creneaux, [cycle]))) {
      setMessage({ type: 'erreur', lignes: ['Le mercredi après-midi est réservé à la vie scolaire.'] })
      return
    }

    // Vue professeur : si une case cible est libre pour le professeur mais que la classe y a cours avec un
    // collègue, on échange les heures de la classe (le collègue reprend l'horaire de départ).
    const classes = new Set(contenuSource.map((s) => `${s.niveau}|${s.section}`))
    const seancesClasses = data.seances.filter((s) => classes.has(`${s.niveau}|${s.section}`))
    const contenuDeplace = (i: number) => {
      const contenu = seancesDeCase(seances, cible.jour, lignes[i])
      return selection.type === 'professeur' && contenu.length === 0 ? seancesDeCase(seancesClasses, cible.jour, lignes[i]) : contenu
    }

    // Le bloc va sur les cases cibles ; ce qu'il y déloge prend, dans l'ordre, les cases qu'il libère.
    const memeJour = cible.jour === source.jour
    const delogees = positionsCible.filter((i) => !memeJour || !positionsSource.includes(i))
    const liberees = positionsSource.filter((i) => !memeJour || !positionsCible.includes(i))
    const mouvements: Mouvement[] = []
    for (let k = 0; k < taille; k++) {
      const creneauId = premierCreneau(lignes[positionsCible[k]])
      if (!creneauId) return
      mouvements.push({ contenu: seancesDeCase(seances, source.jour, lignes[positionsSource[k]]), destination: { jour: cible.jour, creneauId } })
    }
    for (let k = 0; k < delogees.length; k++) {
      const creneauId = premierCreneau(lignes[liberees[k]])
      if (!creneauId) return
      mouvements.push({ contenu: contenuDeplace(delogees[k]), destination: { jour: source.jour, creneauId } })
    }

    const creneauById = new Map(data.creneaux.map((c) => [c.id, c]))
    const echange = calculerPermutation(data.seances, mouvements, creneauById)
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
    const libelle = taille > 1 ? `Séance de ${taille}h déplacée en bloc` : 'Séance déplacée'
    setMessage(
      nouvelles.length > 0
        ? { type: 'info', lignes: [`${libelle} et verrouillée. Attention, règles pédagogiques non respectées :`, ...nouvelles.map((e) => e.detail), ...sallesChangees] }
        : { type: 'info', lignes: [`${libelle} et verrouillée : la prochaine génération la gardera à cette place.`, ...sallesChangees] },
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

  return { message, setMessage, historique, deplacer, annuler, toggleLock, appliquerMutation, lockMutation }
}
