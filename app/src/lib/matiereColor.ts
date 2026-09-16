// Palette fixe de couleurs franchement distinctes (teintes espacées sur le cercle chromatique, pas de
// deux teintes voisines) — suffisamment saturées pour se distinguer d'un coup d'œil, tout en restant
// assez claires pour du texte foncé lisible par-dessus. Assignation déterministe (même matière = même
// couleur partout).
const PALETTE = [
  '#F5A3A3', // rouge
  '#F5C08A', // orange
  '#EFE08A', // jaune
  '#A8DD9E', // vert
  '#8FDCC4', // turquoise
  '#8FCBEA', // bleu ciel
  '#9AB4F0', // bleu
  '#B7A3EF', // indigo
  '#D9A3EF', // violet
  '#F0A3D9', // magenta
  '#D9BE8F', // brun
  '#AEB9BF', // gris ardoise
]

function hashString(value: string): number {
  let hash = 0
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

export function colorForMatiere(matiere: string): string {
  return PALETTE[hashString(matiere) % PALETTE.length]
}
