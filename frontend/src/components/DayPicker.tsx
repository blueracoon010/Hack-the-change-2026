// Calendar button for the Explore filters: pick a day to see only the events happening that day.
// Calgary days ("2026-11-19")
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { calgaryDay } from '../lib/nexus'
import { cx } from './ui'

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const atNoon = (key: string) => new Date(`${key}T12:00:00Z`) // safe for UTC date maths
const keyOf = (d: Date) => d.toISOString().slice(0, 10)
const label = (key: string, opts: Intl.DateTimeFormatOptions) => atNoon(key).toLocaleDateString('en-CA', { ...opts, timeZone: 'UTC' })

export function DayPicker({ value, onChange, onClear, counts }: {
  /** Selected day ("2026-11-19"), or null when another "When" option is active. */
  value: string | null
  onChange: (day: string) => void
  onClear: () => void
  /** Number of events on each day, for the dots. */
  counts: Map<string, number>
}) {
  const today = calgaryDay(new Date())
  const [open, setOpen] = useState(false)
  const [month, setMonth] = useState(() => (value ?? today).slice(0, 7)) // "2026-11"
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const button = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)

  // The filter row scrolls sideways, so the panel is positioned against the window, under the button.
  useLayoutEffect(() => {
    if (!open || !button.current) return
    const place = () => {
      const r = button.current!.getBoundingClientRect()
      const width = 296
      setPos({ top: r.bottom + 8, left: Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8)) })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true) }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!panel.current?.contains(e.target as Node) && !button.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); button.current?.focus() } }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    panel.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"], [data-today]')?.focus()
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  const first = atNoon(`${month}-01`)
  const start = new Date(first); start.setUTCDate(1 - first.getUTCDay())
  const days = Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setUTCDate(start.getUTCDate() + i); return keyOf(d) })
  const weeks = days.slice(35).some((k) => k.startsWith(month)) ? days : days.slice(0, 35)
  const moveMonth = (n: number) => { const d = atNoon(`${month}-01`); d.setUTCMonth(d.getUTCMonth() + n); setMonth(keyOf(d).slice(0, 7)) }

  function pick(day: string) {
    onChange(day)
    setOpen(false)
    button.current?.focus()
  }

  return (
    <>
      <div className={cx('inline-flex shrink-0 items-center rounded-xl border p-1', value ? 'border-brand bg-brand text-white' : 'border-line bg-surface')}>
        <button ref={button} type="button" onClick={() => { setMonth((value ?? today).slice(0, 7)); setOpen((o) => !o) }}
          aria-haspopup="dialog" aria-expanded={open} aria-label={value ? `Showing events on ${label(value, { weekday: 'long', month: 'long', day: 'numeric' })}. Change day` : 'Pick a day'}
          title="Pick a day"
          className={cx('inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-bold transition', value ? 'text-white' : 'text-muted hover:text-fg')}>
          <CalendarDays className="size-4" aria-hidden />
          {value && <span>{value === today ? 'Today' : label(value, { weekday: 'short', month: 'short', day: 'numeric' })}</span>}
        </button>
        {value && (
          <button type="button" onClick={onClear} aria-label="Clear the day" title="Clear the day"
            className="grid size-7 place-items-center rounded-lg text-white/90 hover:bg-white/15">
            <X className="size-3.5" aria-hidden />
          </button>
        )}
      </div>

      {open && pos && (
        <div ref={panel} role="dialog" aria-label="Pick a day" style={{ top: pos.top, left: pos.left }}
          className="fixed z-[1000] w-[296px] rounded-2xl border border-line bg-surface p-3 text-fg shadow-xl">
          <div className="mb-2 flex items-center justify-between">
            <button type="button" onClick={() => moveMonth(-1)} disabled={month <= today.slice(0, 7)} aria-label="Previous month"
              className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-30">
              <ChevronLeft className="size-4" aria-hidden />
            </button>
            <p className="font-extrabold" aria-live="polite">{label(`${month}-01`, { month: 'long', year: 'numeric' })}</p>
            <button type="button" onClick={() => moveMonth(1)} aria-label="Next month"
              className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg">
              <ChevronRight className="size-4" aria-hidden />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-0.5 text-center">
            {WEEKDAYS.map((d, i) => <span key={i} className="pb-1 text-xs font-bold text-muted" aria-hidden>{d}</span>)}
            {weeks.map((key) => {
              const n = counts.get(key) ?? 0
              const past = key < today
              const outside = !key.startsWith(month)
              const selected = key === value
              return (
                <button key={key} type="button" disabled={past} onClick={() => pick(key)} aria-pressed={selected}
                  data-today={key === today ? '' : undefined}
                  aria-label={`${label(key, { weekday: 'long', month: 'long', day: 'numeric' })}, ${n === 0 ? 'no events' : `${n} event${n === 1 ? '' : 's'}`}`}
                  className={cx('relative grid h-10 place-items-center rounded-lg text-sm transition disabled:cursor-default disabled:opacity-30',
                    selected ? 'bg-brand font-extrabold text-white' : 'hover:bg-surface-2',
                    !selected && key === today && 'font-extrabold text-brand-strong ring-1 ring-brand/50',
                    !selected && outside && 'text-muted',
                    !selected && n > 0 && 'font-bold')}>
                  {Number(key.slice(8))}
                  {n > 0 && !past && <span className={cx('absolute bottom-1 size-1 rounded-full', selected ? 'bg-white' : 'bg-brand')} aria-hidden />}
                </button>
              )
            })}
          </div>
          <p className="mt-2 flex items-center gap-1.5 px-1 text-xs text-muted"><span className="size-1.5 rounded-full bg-brand" aria-hidden /> Days with events</p>
        </div>
      )}
    </>
  )
}
