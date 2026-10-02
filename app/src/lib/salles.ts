export type TypeSalle = 'classe' | 'laboratoire' | 'informatique' | 'sport' | 'autre'

export const TYPES_SALLE: { key: TypeSalle; label: string }[] = [
  { key: 'classe', label: 'Salle de classe' },
  { key: 'laboratoire', label: 'Laboratoire' },
  { key: 'informatique', label: 'Salle informatique' },
  { key: 'sport', label: 'Terrain / sport' },
  { key: 'autre', label: 'Autre' },
]

export function typeSalleLabel(type: string): string {
  return TYPES_SALLE.find((t) => t.key === type)?.label ?? type
}
