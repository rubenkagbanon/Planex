// Année scolaire en cours, déduite de la date : la rentrée a lieu en septembre, donc d'août à décembre
// on est dans l'année "N–N+1", de janvier à juillet dans l'année "N-1–N".
export function anneeScolaireCourante(date = new Date()): string {
  const annee = date.getFullYear()
  return date.getMonth() >= 7 ? `${annee}-${annee + 1}` : `${annee - 1}-${annee}`
}

// Année affichée sur les documents : celle saisie par l'établissement, sinon l'année en cours.
export function anneeScolaire(saisie: string | null | undefined): string {
  return saisie?.trim() || anneeScolaireCourante()
}
