// Create your own event. It goes on the Explore map with every other event:
// public events for everyone, private events only for your friends (people you follow who follow you back).
import { useState, type FormEvent, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Globe, Lock, MapPin } from 'lucide-react'
import { LocationPicker } from '../components/map/LocationPicker'
import { Alert, Button, Card, cx, Field, PageHeader, Segmented } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import { POP_DOTS } from '../lib/pop'
import {
  calgaryDay, CATEGORIES, fmtDay, fromCalgaryInput,
  type ApiEvent, type Category, type LatLng, type Vibe, type Visibility,
} from '../lib/nexus'

const ALL_CATS = Object.keys(CATEGORIES) as Category[]
const MAX_CATS = 3
const MAX_DAYS = 7

/** "2026-11-08" (Calgary) -> that day at midnight, Calgary time. */
const dayStart = (day: string) => fromCalgaryInput(`${day}T00:00`)
/** Days from `from` to `to`, counting both ends: Nov 8 to Nov 8 is 1 day. */
const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1
const addDays = (day: string, n: number) => new Date(Date.parse(day) + n * 86_400_000).toISOString().slice(0, 10)
const tomorrow = () => calgaryDay(new Date(Date.now() + 24 * 3600_000))

export default function CreateEvent() {
  const { user } = useAuth()
  const navigate = useNavigate()
  // "Make a plan" on the Plan page opens this form pre-filled (friends-only, on the day everyone is free).
  const prefill = (useLocation().state as { prefill?: { day?: string; title?: string; description?: string; visibility?: Visibility; venue?: string; address?: string; position?: LatLng | null } } | null)?.prefill
  const [title, setTitle] = useState(prefill?.title ?? '')
  const [description, setDescription] = useState(prefill?.description ?? '')
  const [from, setFrom] = useState(prefill?.day ?? tomorrow())
  const [to, setTo] = useState(prefill?.day ?? tomorrow())
  const [venue, setVenue] = useState(prefill?.venue ?? '')
  const [address, setAddress] = useState(prefill?.address ?? '')
  const [position, setPosition] = useState<LatLng | null>(prefill?.position ?? null)
  const [cats, setCats] = useState<Category[]>([])
  const [vibe, setVibe] = useState<Vibe>('either')
  const [cost, setCost] = useState('Free')
  const [indoor, setIndoor] = useState<'indoor' | 'outdoor'>('indoor')
  const [visibility, setVisibility] = useState<Visibility>(prefill?.visibility ?? 'public')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const toggleCat = (c: Category) => setCats((prev) => prev.includes(c) ? prev.filter((x) => x !== c) : prev.length < MAX_CATS ? [...prev, c] : prev)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!from || !to) return setError('Pick the dates your event runs.')
    if (from < calgaryDay(new Date())) return setError('That date has already passed. Pick today or later.')
    const days = daysBetween(from, to)
    if (days < 1) return setError('The end date can’t be before the start date.')
    if (days > MAX_DAYS) return setError(`Events can run for up to ${MAX_DAYS} days.`)
    if (!address.trim() && !position) return setError('Add an address, or tap the map to drop a pin.')
    setSaving(true)
    try {
      const created = await api<ApiEvent>('/api/events', {
        method: 'POST',
        body: {
          title: title.trim(),
          description: description.trim() || undefined,
          host: user?.name,
          categories: cats,
          vibe,
          start: dayStart(from).toISOString(),
          durationMin: days * 24 * 60,
          venue: venue.trim() || undefined,
          address: address.trim() || undefined,
          position: position ?? undefined,
          cost: cost.trim() || 'Free',
          indoor: indoor === 'indoor',
          visibility,
        },
      })
      navigate('/', { state: { focusEventId: created.id } })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-[52rem]">
      <PageHeader title="Bring people" accent="together" subtitle="Host something in your neighbourhood. It shows up on the map with every other event." />

      <form onSubmit={submit} className="space-y-6" noValidate>
        <Step n={1}><Card>
          <SectionTitle>What’s happening?</SectionTitle>
          <div className="space-y-4">
            <Field label="Event name" required minLength={3} maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Sunday morning river walk" />
            <label className="block">
              <span className="mb-1.5 block text-sm font-bold">Details <span className="font-normal text-muted">· optional</span></span>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} rows={4}
                placeholder="What should people expect? Anything to bring? Is it beginner friendly?"
                className="w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 outline-none transition placeholder:text-muted/70 focus:border-brand focus:ring-4 focus:ring-brand/15" />
            </label>
          </div>
        </Card></Step>

        <Step n={2}><Card>
          <SectionTitle>When</SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="From" type="date" required min={calgaryDay(new Date())} value={from}
              onChange={(e) => { const v = e.target.value; setFrom(v); if (v && (!to || to < v)) setTo(v) }}
              hint={from ? fmtDay(dayStart(from)) : undefined} />
            <Field label="To" type="date" required min={from || undefined} max={from ? addDays(from, MAX_DAYS - 1) : undefined} value={to}
              onChange={(e) => setTo(e.target.value)}
              hint={from && to && daysBetween(from, to) >= 1 ? (daysBetween(from, to) === 1 ? 'One day' : `${daysBetween(from, to)} days`) : undefined} />
          </div>
        </Card></Step>

        <Step n={3}><Card>
          <SectionTitle>Where</SectionTitle>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Place name" maxLength={120} value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="e.g. Prince’s Island Park" />
              <Field label="Address" maxLength={200} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="e.g. 698 Eau Claire Ave SW" />
            </div>
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-sm font-bold"><MapPin className="size-4 text-brand-strong" aria-hidden />
                {position ? 'Pin dropped. Drag it to adjust.' : 'Or tap the map to drop a pin'}
              </p>
              <LocationPicker value={position} onChange={setPosition} />
              <p className="mt-2 text-xs text-muted">A pin is the most accurate. Without one, we find the address on the map for you.</p>
            </div>
          </div>
        </Card></Step>

        <Step n={4}><Card>
          <SectionTitle>What kind of event</SectionTitle>
          <div className="space-y-5">
            <div>
              <p className="mb-2 text-sm font-bold">Type <span className="font-normal text-muted">· pick up to {MAX_CATS}, or leave blank and we’ll guess</span></p>
              <div role="group" aria-label="Event type" className="flex flex-wrap gap-2">
                {ALL_CATS.map((c) => {
                  const on = cats.includes(c)
                  const Icon = CATEGORIES[c].icon
                  return (
                    <button key={c} type="button" aria-pressed={on} onClick={() => toggleCat(c)} disabled={!on && cats.length >= MAX_CATS}
                      className={cx('inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-bold transition disabled:opacity-40',
                        on ? 'border-[var(--edge)] bg-fg text-bg' : 'border-[var(--edge)] bg-surface text-fg hover:text-fg')}>
                      <Icon className="size-4" aria-hidden />
                      {CATEGORIES[c].label}
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="flex flex-wrap gap-x-8 gap-y-4">
              <div>
                <p className="mb-2 text-sm font-bold">Vibe</p>
                <Segmented label="Vibe" value={vibe} onChange={setVibe} options={[
                  { value: 'introvert', label: 'Introvert-friendly' }, { value: 'either', label: 'Mixed' }, { value: 'extrovert', label: 'Extrovert' },
                ]} />
              </div>
              <div>
                <p className="mb-2 text-sm font-bold">Setting</p>
                <Segmented label="Indoor or outdoor" value={indoor} onChange={setIndoor} options={[{ value: 'indoor', label: 'Indoors' }, { value: 'outdoor', label: 'Outdoors' }]} />
              </div>
            </div>
            <Field label="Cost" maxLength={40} value={cost} onChange={(e) => setCost(e.target.value)} placeholder="Free, $10, Pay what you can" className="max-w-xs" />
          </div>
        </Card></Step>

        <Step n={5} last><Card>
          <SectionTitle>Who can see it</SectionTitle>
          <div role="radiogroup" aria-label="Who can see it" className="grid gap-3 sm:grid-cols-2">
            <VisibilityOption checked={visibility === 'public'} onSelect={() => setVisibility('public')} icon={<Globe className="size-5" aria-hidden />}
              title="Public" text="Anyone on Nexus can see it on the map and RSVP." />
            <VisibilityOption checked={visibility === 'private'} onSelect={() => setVisibility('private')} icon={<Lock className="size-5" aria-hidden />}
              title="Friends only" text="Only your friends see it: people you follow who follow you back." />
          </div>
        </Card></Step>

        {error && <Alert>{error}</Alert>}
        <div className="flex flex-wrap items-center justify-end gap-3 pb-6">
          <Button type="button" variant="ghost" onClick={() => navigate(-1)}>Cancel</Button>
          <Button type="submit" loading={saving} disabled={title.trim().length < 3}>
            {visibility === 'private' ? 'Post to friends' : 'Post event'}
          </Button>
        </div>
      </form>
    </div>
  )
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="mb-4 text-lg font-extrabold">{children}</h2>
}

/** One step of the form: a numbered dot in the card palette on a rail beside the card, joined to the next step by a line. */
function Step({ n, last, children }: { n: number; last?: boolean; children: ReactNode }) {
  return (
    <div className="flex gap-3 sm:gap-5">
      <div className="relative hidden w-8 shrink-0 justify-center sm:flex" aria-hidden>
        <span className={`relative z-10 mt-5 grid size-8 place-items-center rounded-full text-sm font-bold ${POP_DOTS[(n - 1) % POP_DOTS.length]}`}>{n}</span>
        {!last && <span className="absolute -bottom-11 left-1/2 top-[3.25rem] w-0.5 -translate-x-1/2 rounded-full bg-line" />}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

function VisibilityOption({ checked, onSelect, icon, title, text }: { checked: boolean; onSelect: () => void; icon: ReactNode; title: string; text: string }) {
  return (
    <button type="button" role="radio" aria-checked={checked} onClick={onSelect}
      className={cx('flex items-start gap-3 rounded-2xl border-2 p-4 text-left transition',
        checked ? 'border-brand bg-brand-tint' : 'border-line hover:border-brand/40')}>
      <span className={cx('grid size-10 shrink-0 place-items-center rounded-xl', checked ? 'bg-brand text-on-brand' : 'bg-surface-2 text-muted')}>{icon}</span>
      <span>
        <span className={cx('block font-extrabold', checked && 'text-brand-strong')}>{title}</span>
        <span className="mt-0.5 block text-sm text-muted">{text}</span>
      </span>
    </button>
  )
}
