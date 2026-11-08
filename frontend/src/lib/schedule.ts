// "Plan with friends" types and helpers. Backend: backend/app/schedule/router.py (/api/schedule).
import { Ban, Briefcase, GraduationCap, Moon, Sparkles, Ticket, type LucideIcon } from 'lucide-react'
import { fmtCalgary, fromCalgaryInput } from './nexus'

export type Kind = 'busy' | 'work' | 'class' | 'me_time' | 'open' | 'event'
export type Busy = { start: string; end: string; kind: Kind; source: string; id?: number; label?: string; repeat?: boolean; eventId?: string }
export type Person = { id: number; name: string; me: boolean; sharing: boolean; busy: Busy[] }
export type FreeWindow = { start: string; end: string; minutes: number; preferred: boolean }
export type Fit = { window: number; id: string; title: string; start: string; end: string; venue: string; categories: string[]; price: string; indoor: boolean }
export type Week = { start: string; days: string[]; people: Person[]; together: FreeWindow[]; fits: Fit[]; calendarLinked: boolean; freeHoursTogether: number }
export type Friend = { id: number; name: string; sharing: boolean }
export type CalendarLink = { provider: string; lastSynced: string | null; error: string | null; busyCount: number }
export type ScheduleSettings = { share_with_friends: boolean; calendar: CalendarLink | null }

/** Kinds you can block by hand. Everything except "open" counts as busy. */
export const KINDS: Record<Kind, { label: string; icon: LucideIcon }> = {
  busy: { label: 'Busy', icon: Ban },
  work: { label: 'Work', icon: Briefcase },
  class: { label: 'Class', icon: GraduationCap },
  me_time: { label: 'Me time', icon: Moon },
  open: { label: 'Open to plans', icon: Sparkles },
  event: { label: 'Event', icon: Ticket },
}
export const BLOCKABLE: Kind[] = ['busy', 'work', 'class', 'me_time', 'open']

/** Lane colours (you first, then friends), from the five brand colours and blends of them; `ink` is the readable text colour on top.
 *  Yellow is left out on purpose: it means "everyone is free". */
export const PERSON_COLORS = [
  { bg: 'var(--fg)', ink: 'var(--bg)' },          // you: navy (warm white in dark mode)
  { bg: 'var(--brand-soft)', ink: 'var(--fg)' },  // pastel blue
  { bg: '#5F6276', ink: '#fff' },                 // slate: navy 70% on white
  { bg: 'var(--mustard)', ink: 'var(--navy)' },
  { bg: '#3A3E5C', ink: '#fff' },                 // navy 88% on white
]

export const DAY_START_H = 8
export const DAY_END_H = 22

export const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
export const dayLabel = (day: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric' }) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString('en-CA', { ...opts, timeZone: 'UTC' })

/** Minutes after Calgary midnight of `day` (can be negative or > 1440 for times on other days). */
export function minutesInto(day: string, iso: string) {
  return (Date.parse(iso) - fromCalgaryInput(`${day}T00:00`).getTime()) / 60_000
}

/** Calgary's UTC offset in minutes on `day`, as this browser sees it (sent to the server so both agree). */
export const calgaryOffset = (day: string) => Math.round((Date.parse(`${day}T12:00:00Z`) - fromCalgaryInput(`${day}T12:00`).getTime()) / 60_000)

export const fmtClock = (iso: string) => fmtCalgary(new Date(iso), { hour: 'numeric', minute: '2-digit' }).replace(':00', '')
export const fmtRange = (s: string, e: string) => `${fmtClock(s)} – ${fmtClock(e)}`
export const fmtHours = (min: number) => min >= 60 ? `${+(min / 60).toFixed(1)} h` : `${min} min`

/** Resize a photo in the browser so uploads stay small (about 150 KB). */
export function resizePhoto(file: File, max = 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height))
      const canvas = Object.assign(document.createElement('canvas'), { width: Math.round(img.width * scale), height: Math.round(img.height * scale) })
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', 0.8))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file isn’t a photo we can read.')) }
    img.src = url
  })
}
