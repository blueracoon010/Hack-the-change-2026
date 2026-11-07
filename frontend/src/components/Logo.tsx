import { Zap } from 'lucide-react'
import { APP } from '../config/app'

export function Logo({ compact = false, light = false }: { compact?: boolean; light?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${light ? 'bg-white/20' : 'brand-gradient'} text-white shadow-md shadow-brand/30`} aria-hidden>
        <Zap className="size-5" fill="currentColor" />
      </span>
      {!compact && <span className={`text-lg font-extrabold tracking-tight ${light ? 'text-white' : ''}`}>{APP.name}</span>}
    </div>
  )
}
