import { cn } from '@/lib/utils'

interface PlanexLogoProps {
  size?: number
  variant?: 'dark' | 'light'
  showText?: boolean
  textSize?: number
  animated?: boolean
  className?: string
}

const CELLS: { x: number; y: number; color: 'A' | 'B'; delay: number }[] = [
  { x: 1, y: 1, color: 'A', delay: 0 },
  { x: 10, y: 1, color: 'B', delay: 0.2 },
  { x: 19, y: 1, color: 'A', delay: 0.4 },
  { x: 1, y: 10, color: 'A', delay: 0.6 },
  { x: 10, y: 10, color: 'A', delay: 0.8 },
  { x: 19, y: 10, color: 'B', delay: 1 },
  { x: 1, y: 19, color: 'B', delay: 1.2 },
  { x: 10, y: 19, color: 'A', delay: 1.4 },
  { x: 19, y: 19, color: 'A', delay: 1.6 },
]

const LETTERS = 'Planex'.split('')

export function PlanexLogo({
  size = 34,
  variant = 'dark',
  showText = true,
  textSize,
  animated = true,
  className,
}: PlanexLogoProps) {
  const isLight = variant === 'light'
  const colorA = isLight ? '#F3EFE3' : '#1F3A2E'
  const colorB = isLight ? '#C08F3E' : '#A9762C'
  const resolvedTextSize = textSize ?? Math.round(size * 0.76)

  return (
    <div className={cn('flex items-center', className)} style={{ gap: Math.round(size * 0.35) }}>
      <svg width={size} height={size} viewBox="0 0 28 28" className="flex-shrink-0">
        {CELLS.map((cell) => (
          <rect
            key={`${cell.x}-${cell.y}`}
            x={cell.x}
            y={cell.y}
            width={8}
            height={8}
            rx={2}
            fill={cell.color === 'A' ? colorA : colorB}
            style={
              animated
                ? {
                    transformOrigin: `${cell.x + 4}px ${cell.y + 4}px`,
                    animation: `planex-fill 2.6s ease-in-out infinite`,
                    animationDelay: `${cell.delay}s`,
                  }
                : undefined
            }
          />
        ))}
      </svg>
      {showText && (
        <div className="font-serif font-semibold" style={{ fontSize: resolvedTextSize, color: colorA, display: 'flex' }}>
          {LETTERS.map((letter, i) => (
            <span
              key={i}
              style={
                animated
                  ? {
                      display: 'inline-block',
                      opacity: 0,
                      animation: 'planex-letter-in 0.5s ease-out forwards',
                      animationDelay: `${i * 0.08}s`,
                    }
                  : undefined
              }
            >
              {letter}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
