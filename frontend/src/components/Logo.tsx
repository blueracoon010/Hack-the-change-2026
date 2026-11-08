import { Waypoints } from 'lucide-react'
import { APP } from '../config/app'

export function Logo({ compact = false, light = false }: { compact?: boolean; light?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${light ? 'bg-white/15' : 'brand-gradient'}`} aria-hidden>
        <Waypoints className="size-5" strokeWidth={2.5} />
      </span>
      {!compact && <span className={`text-lg font-extrabold tracking-tight `}>{APP.name}</span>}
    </div>
  )
}
