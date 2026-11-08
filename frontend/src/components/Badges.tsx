// Profile → Badges: add a photo from an event you went to, earn badges for showing up and connecting.
// No leaderboard on purpose: badges celebrate first steps, variety, moving, and going together.
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Camera, Compass, Footprints, Handshake, HeartHandshake, House, ImagePlus, Landmark, Leaf, Lock, Smile, Sun, Trash2, Users, X,
  type LucideIcon,
} from 'lucide-react'
import { api } from '../lib/api'
import { fmtDay } from '../lib/nexus'
import { resizePhoto } from '../lib/schedule'
import { Alert, Button, Card, cx, Field } from './ui'

export type Badge = { id: string; name: string; description: string; icon: string; goal: number; progress: number; earned: boolean; kind: 'milestone' | 'connection' }
export type BadgeSummary = { attended: number; earned: number; total: number; badges: Badge[]; next: { name: string; remaining: number; icon: string } | null }
type CheckIn = { id: number; eventId: string | null; title: string; attendedAt: string; photo: string }
type Option = { id: string; title: string; start: string; venue: string }

export const BADGE_ICONS: Record<string, LucideIcon> = {
  footprints: Footprints, sun: Sun, smile: Smile, house: House, landmark: Landmark,
  users: Users, leaf: Leaf, compass: Compass, 'heart-handshake': HeartHandshake, handshake: Handshake,
}

export function BadgeIcon({ badge, size = 'md' }: { badge: Pick<Badge, 'icon' | 'earned' | 'name'>; size?: 'sm' | 'md' }) {
  const Icon = BADGE_ICONS[badge.icon] ?? Sun
  return <span className={cx('relative grid shrink-0 place-items-center rounded-full', size === 'sm' ? 'size-9' : 'size-16',
    badge.earned ? 'bg-gradient-to-br from-brand to-accent-strong text-white shadow-md shadow-brand/30' : 'bg-surface-2 text-muted ring-1 ring-line')}>
    <Icon className={size === 'sm' ? 'size-4' : 'size-7'} aria-hidden />
    {!badge.earned && size === 'md' && <Lock className="absolute -bottom-0.5 -right-0.5 size-5 rounded-full bg-surface p-1 text-muted ring-1 ring-line" aria-hidden />}
  </span>
}

export function useBadgeSummary() {
  const [summary, setSummary] = useState<BadgeSummary | null>(null)
  const reload = () => api<BadgeSummary>('/api/badges/me').then(setSummary).catch(() => {})
  useEffect(() => {
    void reload()
    const on = () => { void reload() }
    window.addEventListener('nexus-badges-updated', on)
    return () => window.removeEventListener('nexus-badges-updated', on)
  }, [])
  return summary
}

export function Badges() {
  const summary = useBadgeSummary()
  const [photos, setPhotos] = useState<CheckIn[]>([])
  const [adding, setAdding] = useState(false)
  const [celebrate, setCelebrate] = useState<Badge[]>([])
  const [error, setError] = useState('')
  const loadPhotos = () => api<CheckIn[]>('/api/badges/checkins').then(setPhotos).catch(e => setError(e.message))
  useEffect(() => { void loadPhotos() }, [])
  async function remove(id: number) {
    try { await api(`/api/badges/checkins/${id}`, { method: 'DELETE' }); await loadPhotos(); window.dispatchEvent(new Event('nexus-badges-updated')) } catch (e) { setError((e as Error).message) }
  }
  if (!summary) return <p className="py-10 text-center text-muted" role="status">Loading badges…</p>
  const next = summary.badges.find(b => b.kind === 'milestone' && !b.earned)
  const groups: [string, Badge[]][] = [['Showing up', summary.badges.filter(b => b.kind === 'milestone')], ['Connecting', summary.badges.filter(b => b.kind === 'connection')]]

  return <div className="space-y-6">
    {error && <Alert>{error}</Alert>}
    <Card className="overflow-hidden p-0">
      <div className="flex flex-wrap items-center gap-5 bg-brand-tint/60 p-5 sm:p-6">
        <div className="flex items-center gap-4">
          <span className="grid size-16 place-items-center rounded-2xl bg-brand text-white shadow-sm"><Camera className="size-7" aria-hidden /></span>
          <div>
            <p className="text-3xl font-extrabold tabular-nums">{summary.earned}<span className="text-base font-bold text-muted"> / {summary.total}</span></p>
            <p className="text-sm font-bold text-muted">badges · {summary.attended} {summary.attended === 1 ? 'event' : 'events'}</p>
          </div>
        </div>
        {next && <div className="min-w-48 flex-1">
          <div className="mb-1.5 flex items-center justify-between text-sm font-bold"><span>{next.name}</span><span className="text-muted">{next.progress}/{next.goal}</span></div>
          <div className="h-2.5 overflow-hidden rounded-full bg-surface" role="progressbar" aria-label={`Progress to ${next.name}`} aria-valuemin={0} aria-valuemax={next.goal} aria-valuenow={next.progress}>
            <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${(next.progress / next.goal) * 100}%` }} />
          </div>
        </div>}
        <Button onClick={() => setAdding(true)}><ImagePlus size={17} aria-hidden />Add event photo</Button>
      </div>
      <p className="px-5 py-3 text-xs text-muted sm:px-6">Badges celebrate showing up and connecting. No rankings, no streaks.</p>
    </Card>

    {groups.map(([title, list]) => <section key={title} aria-labelledby={`badges-${title}`}>
      <h2 id={`badges-${title}`} className="mb-3 text-sm font-extrabold uppercase tracking-wide text-muted">{title}</h2>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {list.map(b => <li key={b.id} title={b.description} className={cx('flex flex-col items-center gap-2 rounded-2xl border p-4 text-center', b.earned ? 'border-brand/40 bg-surface' : 'border-line bg-surface/60')}>
          <BadgeIcon badge={b} />
          <p className={cx('text-sm font-extrabold leading-tight', !b.earned && 'text-muted')}>{b.name}</p>
          <p className="sr-only">{b.description}. {b.earned ? 'Earned.' : `${b.progress} of ${b.goal}.`}</p>
          {!b.earned && b.goal > 1 && <div className="h-1.5 w-full max-w-20 overflow-hidden rounded-full bg-surface-2" aria-hidden><div className="h-full bg-brand-soft" style={{ width: `${(b.progress / b.goal) * 100}%` }} /></div>}
          <p className="text-[11px] leading-snug text-muted" aria-hidden>{b.description}</p>
        </li>)}
      </ul>
    </section>)}

    <section aria-labelledby="memories-h">
      <h2 id="memories-h" className="mb-3 text-sm font-extrabold uppercase tracking-wide text-muted">Memories</h2>
      {photos.length === 0 ? <button type="button" onClick={() => setAdding(true)} className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-line p-8 text-muted hover:bg-surface-2">
        <ImagePlus className="size-8 text-brand-strong" aria-hidden /><span className="font-bold text-fg">Add your first event photo</span>
      </button> : <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {photos.map(p => <li key={p.id} className="group relative overflow-hidden rounded-2xl border border-line bg-surface">
          <img src={p.photo} alt={`At ${p.title}`} className="aspect-square w-full object-cover" loading="lazy" />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-3 pt-8 text-white">
            <p className="line-clamp-2 text-sm font-bold leading-tight">{p.title}</p>
            <p className="text-xs opacity-80">{fmtDay(new Date(p.attendedAt))}</p>
          </div>
          <button type="button" onClick={() => remove(p.id)} aria-label={`Remove photo from ${p.title}`}
            className="absolute right-2 top-2 rounded-full bg-black/55 p-1.5 text-white opacity-0 transition group-hover:opacity-100 focus:opacity-100"><Trash2 size={15} /></button>
        </li>)}
      </ul>}
    </section>

    {adding && <AddPhoto onClose={() => setAdding(false)} onDone={(fresh) => { setAdding(false); setCelebrate(fresh); void loadPhotos(); window.dispatchEvent(new Event('nexus-badges-updated')) }} />}
    {celebrate.length > 0 && <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onMouseDown={e => e.target === e.currentTarget && setCelebrate([])}>
      <div role="dialog" aria-modal="true" aria-label="New badge" className="w-full max-w-sm rounded-3xl border border-line bg-surface p-6 text-center shadow-xl">
        <div className="flex justify-center gap-3">{celebrate.map(b => <BadgeIcon key={b.id} badge={b} />)}</div>
        <h2 className="mt-4 text-2xl font-extrabold">{celebrate.length === 1 ? 'New badge' : `${celebrate.length} new badges`}</h2>
        <p className="mt-1 font-bold text-brand-strong">{celebrate.map(b => b.name).join(' · ')}</p>
        <Button className="mt-5" onClick={() => setCelebrate([])} autoFocus>Nice</Button>
      </div>
    </div>}
  </div>
}

function AddPhoto({ onClose, onDone }: { onClose: () => void; onDone: (fresh: Badge[]) => void }) {
  const [options, setOptions] = useState<Option[] | null>(null)
  const [eventId, setEventId] = useState<string>('')
  const [title, setTitle] = useState('')
  const [photo, setPhoto] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    api<Option[]>('/api/badges/checkin-options').then(o => { setOptions(o); setEventId(o[0]?.id ?? 'other') }).catch(e => setError(e.message))
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  async function pick(f: File) {
    setError('')
    try { setPhoto(await resizePhoto(f)) } catch (e) { setError((e as Error).message) }
  }
  async function submit() {
    setBusy(true); setError('')
    try {
      const r = await api<{ newBadges: Badge[] }>('/api/badges/checkins', { method: 'POST', body: eventId === 'other' ? { title, photo } : { eventId: Number(eventId), photo } })
      onDone(r.newBadges)
    } catch (e) { setError((e as Error).message); setBusy(false) }
  }
  const ready = !!photo && (eventId === 'other' ? title.trim().length >= 3 : !!eventId)
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onMouseDown={e => e.target === e.currentTarget && onClose()}>
    <div role="dialog" aria-modal="true" aria-labelledby="add-photo-h" className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-line bg-surface p-6 shadow-xl">
      <div className="mb-4 flex items-center justify-between"><h2 id="add-photo-h" className="text-xl font-extrabold">Add event photo</h2>
        <button type="button" onClick={onClose} className="rounded-lg p-1 text-muted hover:bg-surface-2" aria-label="Close"><X size={20} /></button></div>

      <input ref={input} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void pick(f); e.target.value = '' }} />
      <button type="button" onClick={() => input.current?.click()}
        className={cx('relative grid w-full place-items-center overflow-hidden rounded-2xl border-2 border-dashed transition', photo ? 'border-transparent' : 'aspect-video border-line hover:bg-surface-2')}>
        {photo ? <img src={photo} alt="Your event photo" className="max-h-72 w-full object-cover" />
          : <span className="flex flex-col items-center gap-2 text-muted"><Camera className="size-8 text-brand-strong" aria-hidden /><span className="font-bold text-fg">Take or choose a photo</span></span>}
        {photo && <span className="absolute bottom-2 right-2 rounded-full bg-black/60 px-3 py-1 text-xs font-bold text-white">Change</span>}
      </button>

      <fieldset className="mt-5">
        <legend className="mb-2 text-sm font-bold">Which event?</legend>
        {options === null ? <p className="text-sm text-muted">Loading…</p> : <div className="max-h-56 space-y-2 overflow-y-auto">
          {options.map(o => <label key={o.id} className={cx('flex cursor-pointer items-center gap-3 rounded-xl border p-3', eventId === o.id ? 'border-brand bg-brand-tint' : 'border-line hover:bg-surface-2')}>
            <input type="radio" name="event" className="accent-[var(--brand)]" checked={eventId === o.id} onChange={() => setEventId(o.id)} />
            <span className="min-w-0"><span className="block truncate text-sm font-bold">{o.title}</span><span className="block truncate text-xs text-muted">{fmtDay(new Date(o.start))}{o.venue && ` · ${o.venue}`}</span></span>
          </label>)}
          <label className={cx('flex cursor-pointer items-center gap-3 rounded-xl border p-3', eventId === 'other' ? 'border-brand bg-brand-tint' : 'border-line hover:bg-surface-2')}>
            <input type="radio" name="event" className="accent-[var(--brand)]" checked={eventId === 'other'} onChange={() => setEventId('other')} />
            <span className="text-sm font-bold">Something not on Nexus</span>
          </label>
          {options.length === 0 && <p className="text-xs text-muted">Events you RSVP to show up here once they start. <Link to="/" className="font-bold text-brand-strong">Find one</Link></p>}
        </div>}
        {eventId === 'other' && <Field className="mt-3" label="Event name" maxLength={120} value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Saturday park run" />}
      </fieldset>

      {error && <div className="mt-4"><Alert>{error}</Alert></div>}
      <div className="mt-5 flex gap-2 border-t border-line pt-4">
        <Button onClick={submit} loading={busy} disabled={!ready}>Add photo</Button>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
      </div>
    </div>
  </div>
}
