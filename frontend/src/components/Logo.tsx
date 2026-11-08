import { Waypoints } from 'lucide-react'
import { APP } from '../config/app'

/** Nexus logo: the "connections" mark in near-black (cream in dark mode). No brand colour, on purpose. */
export function Logo({ compact = false, light = false }: { compact?: boolean; light?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${light ? 'bg-white/15 text-white' : 'bg-fg text-bg'}`} aria-hidden>
        <Waypoints className="size-4" strokeWidth={2.5} />
      </span>
      {!compact && <span className="text-base font-semibold tracking-tight">{APP.name}</span>}
    </div>
  )
}
