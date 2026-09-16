import { NIVEAUX_ETABLISSEMENT } from '@/lib/horairesReference'

// "3e" → { niveau: '3e' } · "3e-2" → { niveau: '3e', section: 2 }
export function parseClasseCode(code: string): { niveau: string; section?: number } {
  const match = code.match(/^(.+)-(\d+)$/)
  if (match) return { niveau: match[1], section: Number(match[2]) }
  return { niveau: code }
}

// "3e-2" → "3e 2" (libellé lisible)
export function formatClasseCode(code: string): string {
  const { niveau, section } = parseClasseCode(code)
  const label = NIVEAUX_ETABLISSEMENT.find((n) => n.key === niveau)?.label ?? niveau
  return section !== undefined ? `${label} ${section}` : label
}

// Expanse les codes niveaux d'un professeur ("3e" ou "3e-2") en couples { niveau, section } concrets.
// Un code sans section explicite ("3e") couvre toutes les sections du niveau (1..nombreClasses).
export function expandNiveauCodes(
  codes: string[],
  nombreClassesParNiveau: Record<string, number>,
): { niveau: string; section: number }[] {
  return codes.flatMap((code) => {
    const { niveau, section } = parseClasseCode(code)
    if (section !== undefined) return [{ niveau, section }]
    const nombreClasses = nombreClassesParNiveau[niveau] ?? 1
    return Array.from({ length: nombreClasses }, (_, i) => ({ niveau, section: i + 1 }))
  })
}
