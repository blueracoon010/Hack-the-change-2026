// Profile > Saved: every event you bookmarked on the map (the bookmark button), from the shared database.
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Bell, BellOff, Bookmark, BookmarkX, Check, MapPin, Users } from 'lucide-react'
import { useApi } from '../hooks/useApi'
import { api } from '../lib/api'
import { fmtWhen, fromApi, SOURCE_LABEL, TIME_ZONE, type ApiEvent, type NexusEvent } from '../lib/nexus'
import { Button, Card, cx, ErrorState, Loading } from './ui'

export function SavedEvents() {
  const { data, error, loading, reload } = useApi<ApiEvent[]>('/api/events/saved/events')
  const { data: flags, reload: reloadFlags } = useApi<{ saved: string[]; reminders: string[] }>('/api/events/saved')
  const events = (data ?? []).map(fromApi)
  const reminders = new Set(flags?.reminders ?? [])
  const now = Date.now()
  const isPast = (e: NexusEvent) => e.start.getTime() + e.durationMin * 60_000 < now
  const upcoming = events.filter((e) => !isPast(e))
  const past = events.filter(isPast).reverse()
  const refresh = () => { reload(); reloadFlags() }

  return (
    <Card>
      <div className="mb-5">
        <h2 className="flex items-center gap-2 text-lg font-extrabold"><Bookmark className="size-5 text-brand-strong" aria-hidden /> Saved events</h2>
        <p className="text-sm text-muted">Events you bookmarked on the map. Saved to your account, so they’re here on any device.</p>
      </div>
      {error ? <ErrorState message={error.message} onRetry={refresh} />
        : loading && !data ? <Loading label="Loading saved events" />
        : events.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line px-4 py-10 text-center">
            <Bookmark className="mx-auto mb-3 size-8 text-brand-strong" aria-hidden />
            <p className="font-bold">Nothing saved yet</p>
            <p className="mt-1 text-sm text-muted">Tap the bookmark on any event to keep it here.</p>
            <Link to="/" className="mt-4 inline-block font-bold text-brand-strong hover:underline">Browse events on the map</Link>
          </div>
        ) : (
          <div className="space-y-6">
            <Group title="Upcoming" events={upcoming} reminders={reminders} onChange={refresh} empty="No upcoming saved events." />
            {past.length > 0 && <Group title="Past" events={past} reminders={reminders} onChange={refresh} past />}
          </div>
        )}
    </Card>
  )
}

function Group({ title, events, reminders, onChange, past, empty }: {
  title: string; events: NexusEvent[]; reminders: Set<string>; onChange: () => void; past?: boolean; empty?: string
}) {
  return (
    <section aria-label={`${title} saved events`}>
      <h3 className="mb-2 text-xs font-extrabold uppercase tracking-[0.18em] text-muted">{title} · {events.length}</h3>
      {events.length === 0 ? <p className="text-sm text-muted">{empty}</p> : (
        <ul className="space-y-2">{events.map((e) => <li key={e.id}><SavedRow event={e} reminder={reminders.has(e.id)} past={past} onChange={onChange} /></li>)}</ul>
      )}
    </section>
  )
}

function SavedRow({ event: e, reminder, past, onChange }: { event: NexusEvent; reminder: boolean; past?: boolean; onChange: () => void }) {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const month = e.start.toLocaleDateString('en-CA', { month: 'short', timeZone: TIME_ZONE })
  const day = e.start.toLocaleDateString('en-CA', { day: 'numeric', timeZone: TIME_ZONE })

  async function setFlags(next: { saved: boolean; reminder: boolean }) {
    setBusy(true); setError(null)
    try { await api(`/api/events/${e.id}/save`, { method: 'PUT', body: next }); onChange() }
    catch (err) { setError(err instanceof Error ? err.message : String(err)) }
    finally { setBusy(false) }
  }

  return (
    <div className={cx('flex flex-wrap items-center gap-4 rounded-2xl border border-line p-3 sm:flex-nowrap', past && 'opacity-70')}>
      <div className="grid w-14 shrink-0 place-items-center rounded-xl bg-brand-tint py-2 text-brand-strong" aria-hidden>
        <span className="text-xs font-bold uppercase">{month}</span>
        <span className="text-xl font-extrabold leading-none">{day}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-bold">{e.title}</p>
        <p className="flex flex-wrap items-center gap-x-3 text-sm text-muted">
          <span>{fmtWhen(e.start)}</span>
          {(e.venue || e.address) && <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" aria-hidden />{e.venue || e.address}</span>}
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-xs font-semibold">
          {e.meGoing && <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-accent-strong"><Check className="size-3" aria-hidden />You’re going</span>}
          {reminder && !past && <span className="inline-flex items-center gap-1 rounded-full bg-brand-tint px-2 py-0.5 text-brand-strong"><Bell className="size-3" aria-hidden />Reminder on</span>}
          <span className="inline-flex items-center gap-1 text-muted"><Users className="size-3.5" aria-hidden />{e.going} going</span>
          {e.source && e.source !== 'community' && <span className="text-muted">· {SOURCE_LABEL[e.source]}</span>}
        </p>
        {error && <p role="alert" className="mt-1 text-sm font-semibold text-danger">{error}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {!past && <Button variant="secondary" className="px-3 py-1.5 text-sm" onClick={() => navigate('/', { state: { focusEventId: e.id } })}>View on map</Button>}
        {!past && (
          <button type="button" disabled={busy} onClick={() => setFlags({ saved: true, reminder: !reminder })}
            aria-label={reminder ? `Turn off reminder for ${e.title}` : `Remind me the day before ${e.title}`} title={reminder ? 'Turn off reminder' : 'Remind me the day before'}
            className="grid size-9 place-items-center rounded-xl text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-50">
            {reminder ? <BellOff className="size-4.5" aria-hidden /> : <Bell className="size-4.5" aria-hidden />}
          </button>
        )}
        <button type="button" disabled={busy} onClick={() => setFlags({ saved: false, reminder: false })}
          aria-label={`Remove ${e.title} from saved`} title="Remove from saved"
          className="grid size-9 place-items-center rounded-xl text-muted hover:bg-surface-2 hover:text-danger disabled:opacity-50">
          <BookmarkX className="size-4.5" aria-hidden />
        </button>
      </div>
    </div>
  )
}
