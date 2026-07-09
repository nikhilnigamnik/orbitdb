import { cn } from '@renderer/lib/utils'

interface SpinnerProps {
  size?: number
  className?: string
}

export function Spinner({ size = 16, className }: SpinnerProps) {
  return (
    <div
      className={cn('relative shrink-0 text-neutral-400', className)}
      style={{ width: size, height: size }}
    >
      <div className="absolute top-1/2 left-1/2 size-full">
        {[...Array(12)].map((_, i) => (
          <div
            key={i}
            className="animate-spinner absolute rounded-full bg-current"
            style={{
              animationDelay: `${-1.2 + 0.1 * i}s`,
              width: '30%',
              height: '8%',
              left: '-10%',
              top: '-4%',
              transform: `rotate(${30 * i}deg) translate(120%)`
            }}
          />
        ))}
      </div>
    </div>
  )
}
