import { supabase } from '@/lib/supabase'
import type { CreneauPropose, HorairesModele } from '@/lib/apprentissage'

// Enregistre les horaires d'un cycle (jours, mercredi après-midi, créneaux) : les créneaux identiques sont
// gardés, les autres supprimés (avec les séances qui y étaient placées, par cascade) et les nouveaux ajoutés.
// Les autres réglages du cycle (règles, couleurs…) ne sont pas touchés.
export async function enregistrerHorairesCycle(etablissementId: string, hm: HorairesModele, idsASupprimer: string[], aAjouter: CreneauPropose[]) {
  // Jours et mercredi après-midi ; les autres réglages du cycle (règles, couleurs…) ne sont pas touchés
  const { data: existante, error: lectureError } = await supabase
    .from('horaires_contraintes')
    .select('id')
    .eq('etablissement_id', etablissementId)
    .eq('cycle', hm.cycle)
    .maybeSingle()
  if (lectureError) throw lectureError
  const { error: contrainteError } = existante
    ? await supabase
        .from('horaires_contraintes')
        .update({ jours_cours: hm.jours, mercredi_apres_midi_banalise: hm.mercrediApresMidiBanalise })
        .eq('id', existante.id)
    : await supabase
        .from('horaires_contraintes')
        .insert({ etablissement_id: etablissementId, cycle: hm.cycle, jours_cours: hm.jours, mercredi_apres_midi_banalise: hm.mercrediApresMidiBanalise })
  if (contrainteError) throw contrainteError

  if (idsASupprimer.length > 0) {
    const { error } = await supabase.from('creneaux_horaires').delete().in('id', idsASupprimer)
    if (error) throw error
  }
  if (aAjouter.length > 0) {
    const { error } = await supabase.from('creneaux_horaires').insert(
      aAjouter.map((c) => ({ etablissement_id: etablissementId, cycle: hm.cycle, heure_debut: c.heureDebut, heure_fin: c.heureFin, type: c.type })),
    )
    if (error) throw error
  }
}
