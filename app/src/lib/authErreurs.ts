// Messages d'erreur de Supabase Auth (en anglais) traduits pour les écrans de connexion, d'inscription et de
// mot de passe. On s'appuie d'abord sur le code d'erreur, puis sur le texte pour les versions qui n'en ont pas.
const PAR_CODE: Record<string, string> = {
  invalid_credentials: 'Email ou mot de passe incorrect.',
  email_not_confirmed: "Ton adresse email n'est pas encore confirmée : ouvre le lien reçu par email, puis reconnecte-toi.",
  user_already_exists: 'Un compte existe déjà avec cette adresse email. Connecte-toi ou utilise « Mot de passe oublié ».',
  email_exists: 'Un compte existe déjà avec cette adresse email. Connecte-toi ou utilise « Mot de passe oublié ».',
  weak_password: 'Mot de passe trop faible : au moins 8 caractères, en mélangeant lettres et chiffres.',
  same_password: "Le nouveau mot de passe doit être différent de l'ancien.",
  over_request_rate_limit: 'Trop de tentatives. Patiente quelques minutes avant de réessayer.',
  over_email_send_rate_limit: "Trop d'emails envoyés à cette adresse. Patiente quelques minutes avant de réessayer.",
  email_address_invalid: "Cette adresse email n'est pas valide.",
  validation_failed: "Les informations saisies ne sont pas valides.",
  session_not_found: 'Ta session a expiré. Reconnecte-toi.',
  user_not_found: 'Aucun compte ne correspond à cette adresse email.',
  signup_disabled: 'Les inscriptions sont fermées pour le moment.',
}

const PAR_TEXTE: [RegExp, string][] = [
  [/invalid login credentials/i, PAR_CODE.invalid_credentials],
  [/email not confirmed/i, PAR_CODE.email_not_confirmed],
  [/already registered|already exists/i, PAR_CODE.user_already_exists],
  [/password should be at least|weak password/i, PAR_CODE.weak_password],
  [/different from the old password/i, PAR_CODE.same_password],
  [/rate limit|too many requests|security purposes/i, PAR_CODE.over_request_rate_limit],
  [/invalid email|unable to validate email/i, PAR_CODE.email_address_invalid],
  [/failed to fetch|network/i, 'Connexion au serveur impossible. Vérifie ta connexion internet et réessaie.'],
]

export function traduireErreurAuth(error: { message?: string; code?: string } | null | undefined): string {
  if (!error) return 'Une erreur est survenue. Réessaie.'
  if (error.code && PAR_CODE[error.code]) return PAR_CODE[error.code]
  const message = error.message ?? ''
  for (const [motif, traduction] of PAR_TEXTE) if (motif.test(message)) return traduction
  return message || 'Une erreur est survenue. Réessaie.'
}
