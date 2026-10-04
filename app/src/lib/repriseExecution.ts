import { supabase } from '@/lib/supabase'
import { horairesDuModele } from '@/lib/apprentissage'
import type { Cycle } from '@/lib/cycle'
import { enregistrerHorairesCycle } from '@/lib/horairesApplication'
import type { ClassePdf, LigneVersion } from '@/lib/importEdtPdf'
import { capaciteNouvelleSalle, nomNormalise, type BilanReprise, type ChoixReprise, type SimulationReprise } from '@/lib/reprise'

// Exécute la reprise validée par le censeur : sauvegarde de l'emploi du temps actuel, création des créneaux,
// classes, salles et fiches manquants, puis remplacement de l'emploi du temps par les séances retenues,
// verrouillées. En cas d'échec à l'écriture des séances, l'emploi du temps sauvegardé est restauré.

export interface ResultatReprise {
  sauvegarde: string | null
  seancesEcrites: number
  fichesCreees: number
  fichesMisesAJour: number
  classesCreees: number
  sallesCreees: number
  creneauxModifies: boolean
}

const heureCle = (h: string) => h.slice(0, 5)
const codeClasse = (l: Pick<LigneVersion, 'niveau' | 'section'>) => `${l.niveau}-${l.section}`

function typeSalle(nom: string): 'classe' | 'laboratoire' | 'informatique' | 'sport' | 'autre' {
  if (/LABO/i.test(nom)) return 'laboratoire'
  if (/INFO|TICE/i.test(nom)) return 'informatique'
  if (/TERRAIN|PLATEAU|STADE|GYM/i.test(nom)) return 'sport'
  if (/AMPHI/i.test(nom)) return 'autre'
  return 'classe'
}

export async function executerReprise(params: {
  etablissementId: string
  lignes: LigneVersion[]
  bilan: BilanReprise
  choix: ChoixReprise
  simulation: SimulationReprise
  // Professeurs principaux lus dans les PDF (disponibles juste après un import)
  classesPdf?: ClassePdf[]
  reprendreProfesseursPrincipaux: boolean
  nbSeancesActuelles: number
}): Promise<ResultatReprise> {
  const { etablissementId, lignes, bilan, choix, simulation } = params
  const resultat: ResultatReprise = { sauvegarde: null, seancesEcrites: 0, fichesCreees: 0, fichesMisesAJour: 0, classesCreees: 0, sallesCreees: 0, creneauxModifies: false }

  // 1. Sauvegarde de l'emploi du temps actuel
  if (params.nbSeancesActuelles > 0) {
    const { data, error } = await supabase.rpc('enregistrer_version', { p_label: `Avant la reprise d'un emploi du temps importé (${new Date().toLocaleString('fr-FR')})` })
    if (error) throw error
    resultat.sauvegarde = data
  }

  // 2. Créneaux : les horaires du modèle, pour chaque cycle qui en manque
  if (choix.creerCreneaux && bilan.horairesManquants.length > 0) {
    const cycles = [...new Set(bilan.horairesManquants.map((h) => h.cycle))]
    const { data: actuels, error } = await supabase.from('creneaux_horaires').select('*').eq('etablissement_id', etablissementId)
    if (error) throw error
    for (const hm of horairesDuModele(lignes.map((l) => ({ cycle: l.cycle as Cycle, jour: l.jour, heureDebut: l.heure_debut, heureFin: l.heure_fin })))) {
      if (!cycles.includes(hm.cycle)) continue
      const duCycle = actuels.filter((c) => c.cycle === hm.cycle)
      const cle = (d: string, f: string, t: string) => `${heureCle(d)}|${heureCle(f)}|${t}`
      const proposes = new Set(hm.creneaux.map((c) => cle(c.heureDebut, c.heureFin, c.type)))
      const existants = new Set(duCycle.map((c) => cle(c.heure_debut, c.heure_fin, c.type)))
      await enregistrerHorairesCycle(
        etablissementId,
        hm,
        duCycle.filter((c) => !proposes.has(cle(c.heure_debut, c.heure_fin, c.type))).map((c) => c.id),
        hm.creneaux.filter((c) => !existants.has(cle(c.heureDebut, c.heureFin, c.type))),
      )
    }
    resultat.creneauxModifies = true
  }

  // 3. Classes manquantes : on porte le nombre de classes du niveau jusqu'à la section la plus haute
  if (choix.creerClasses && bilan.classesManquantes.length > 0) {
    const maxParNiveau = new Map<string, number>()
    for (const c of bilan.classesManquantes.filter((x) => x.niveauValide)) maxParNiveau.set(c.niveau, Math.max(maxParNiveau.get(c.niveau) ?? 0, c.section))
    const { data: existants, error } = await supabase.from('classes_etablissement').select('id, niveau, nombre_classes').eq('etablissement_id', etablissementId)
    if (error) throw error
    for (const [niveau, nombre] of maxParNiveau) {
      const ligne = existants.find((e) => e.niveau === niveau)
      const { error: e2 } = ligne
        ? await supabase.from('classes_etablissement').update({ nombre_classes: Math.max(ligne.nombre_classes, nombre) }).eq('id', ligne.id)
        : await supabase.from('classes_etablissement').insert({ etablissement_id: etablissementId, niveau, nombre_classes: nombre })
      if (e2) throw e2
    }
    resultat.classesCreees = bilan.classesManquantes.filter((x) => x.niveauValide).length
  }

  // 4. Salles manquantes
  if (choix.creerSalles && bilan.sallesManquantes.length > 0) {
    const { error } = await supabase.from('salles').insert(
      bilan.sallesManquantes.map((s) => ({ etablissement_id: etablissementId, nom: s.nom, type: typeSalle(s.nom), capacite: capaciteNouvelleSalle(s.nom) })),
    )
    if (error) throw error
    resultat.sallesCreees = bilan.sallesManquantes.length
  }

  // 5. Fiches professeurs : créations, et classes du PDF ajoutées aux fiches associées
  const ficheParCle = new Map<string, string>()
  const { data: fiches, error: fichesError } = await supabase.from('professeurs').select('id, nom_complet, matiere, niveaux').eq('etablissement_id', etablissementId)
  if (fichesError) throw fichesError
  for (const p of bilan.professeurs) {
    const action = choix.professeurs[p.cle]
    if (!action || action.type === 'ignorer') continue
    if (action.type === 'creer') {
      const { data, error } = await supabase
        .from('professeurs')
        .insert({ etablissement_id: etablissementId, nom_complet: p.nom, matiere: p.matiere, niveaux: p.classes, remarque: 'Créé depuis un emploi du temps importé' })
        .select('id')
        .single()
      if (error) throw error
      ficheParCle.set(p.cle, data.id)
      resultat.fichesCreees++
    } else {
      ficheParCle.set(p.cle, action.ficheId)
      const fiche = fiches.find((f) => f.id === action.ficheId)
      const manquantes = p.classes.filter((c) => !(fiche?.niveaux ?? []).includes(c))
      if (fiche && manquantes.length > 0) {
        const { error } = await supabase.from('professeurs').update({ niveaux: [...fiche.niveaux, ...manquantes] }).eq('id', fiche.id)
        if (error) throw error
        resultat.fichesMisesAJour++
      }
    }
  }

  // 6. Professeurs principaux lus dans les PDF
  if (params.reprendreProfesseursPrincipaux && params.classesPdf?.length) {
    const { data: details, error } = await supabase.from('classes_details').select('id, niveau, section').eq('etablissement_id', etablissementId)
    if (error) throw error
    for (const c of params.classesPdf.filter((x) => x.professeurPrincipal)) {
      const ligne = details.find((d) => d.niveau === c.niveau && d.section === c.section)
      const { error: e2 } = ligne
        ? await supabase.from('classes_details').update({ professeur_principal: c.professeurPrincipal }).eq('id', ligne.id)
        : await supabase.from('classes_details').insert({ etablissement_id: etablissementId, niveau: c.niveau, section: c.section, professeur_principal: c.professeurPrincipal })
      if (e2) throw e2
    }
  }

  // 7. Séances : remplacement de l'emploi du temps par les séances retenues, verrouillées
  const [{ data: creneaux, error: ce }, { data: salles, error: se }] = await Promise.all([
    supabase.from('creneaux_horaires').select('id, cycle, heure_debut, type').eq('etablissement_id', etablissementId),
    supabase.from('salles').select('id, nom').eq('etablissement_id', etablissementId),
  ])
  if (ce) throw ce
  if (se) throw se
  const creneauId = new Map(creneaux.filter((c) => c.type === 'cours').map((c) => [`${c.cycle}|${heureCle(c.heure_debut)}`, c.id]))
  const salleId = new Map(salles.map((s) => [s.nom.trim().toUpperCase(), s.id]))
  const groupes = new Map<string, string>()
  const lignesBase = simulation.reprises.flatMap((l) => {
    const professeurId = ficheParCle.get(`${l.professeur_nom}|${l.matiere}`)
    const creneau = creneauId.get(`${l.cycle}|${heureCle(l.heure_debut)}`)
    if (!professeurId || !creneau) return []
    let groupe: string | null = null
    if (l.groupe_seance) {
      if (!groupes.has(l.groupe_seance)) groupes.set(l.groupe_seance, crypto.randomUUID())
      groupe = groupes.get(l.groupe_seance)!
    }
    return [
      {
        etablissement_id: etablissementId,
        cycle: l.cycle,
        jour: l.jour,
        creneau_id: creneau,
        niveau: l.niveau,
        section: l.section,
        matiere: l.matiere,
        professeur_id: professeurId,
        salle_id: l.salle_nom ? salleId.get(l.salle_nom.trim().toUpperCase()) ?? null : null,
        verrouille: true,
        groupe_seance: groupe,
      },
    ]
  })

  const { error: deleteError } = await supabase.from('emploi_du_temps').delete().eq('etablissement_id', etablissementId)
  if (deleteError) throw deleteError
  try {
    for (let i = 0; i < lignesBase.length; i += 400) {
      const { error } = await supabase.from('emploi_du_temps').insert(lignesBase.slice(i, i + 400))
      if (error) throw error
    }
  } catch (e) {
    // Retour à l'emploi du temps d'avant la reprise
    await supabase.from('emploi_du_temps').delete().eq('etablissement_id', etablissementId)
    if (resultat.sauvegarde) await supabase.rpc('restaurer_version', { p_version_id: resultat.sauvegarde })
    throw e
  }
  resultat.seancesEcrites = lignesBase.length
  return resultat
}

// Personnes distinctes du PDF (pour le résumé)
export const nbPersonnes = (lignes: LigneVersion[]) => new Set(lignes.map((l) => nomNormalise(l.professeur_nom))).size
export const nbClasses = (lignes: LigneVersion[]) => new Set(lignes.map(codeClasse)).size
