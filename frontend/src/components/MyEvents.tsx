// Profile > My events: everything you've created, upcoming and past, with who can see it and how many are going.
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CalendarPlus, Footprints, Globe, Lock, MapPin, Trash2, Users } from 'lucide-react'
import { useApi } from '../hooks/useApi'
import { api } from '../lib/api'
import { fmtWhen, fromApi, TIME_ZONE, type ApiEvent, type NexusEvent } from '../lib/nexus'
import { Button, Card, cx, ErrorState, Loading } from './ui'

export function MyEvents() {
  const { data, error, loading, reload } = useApi<ApiEvent[]>('/api/events/mine')
  const events = (data ?? []).map(fromApi)
  const now = Date.now()
  const isPast = (e: NexusEvent) => e.start.getTime() + e.durationMin * 60_000 < now
  const upcoming = events.filter((e) => !isPast(e)).sort((a, b) => a.start.getTime() - b.start.getTime())
  const past = events.filter(isPast)

  return (
    <Card>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold">My events</h2>
          <p className="text-sm text-muted">Events you’re hosting. Public ones are on everyone’s map; friends-only ones just on your friends’.</p>
        </div>
        <Link to="/create" className="btn-primary inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold">
          <CalendarPlus className="size-4" aria-hidden /> Create event
        </Link>
      </div>

      {error ? <ErrorState message={error.message} onRetry={reload} />
        : loading && !data ? <Loading label="Loading your events" />
        : events.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line px-4 py-10 text-center">
            <CalendarPlus className="mx-auto mb-3 size-8 text-brand-strong" aria-hidden />
            <p className="font-bold">You haven’t created any events yet</p>
            <p className="mt-1 text-sm text-muted">A walk, a game night, a coffee meetup: anything counts.</p>
          </div>
        ) : (
          <div className="space-y-6">
            <EventGroup title="Upcoming" events={upcoming} onDeleted={reload} empty="Nothing coming up. Create something new!" />
            {past.length > 0 && <EventGroup title="Past" events={past} onDeleted={reload} past />}
          </div>
        )}
    </Card>
  )
}

function EventGroup({ title, events, onDeleted, past, empty }: { title: string; events: NexusEvent[]; onDeleted: () => void; past?: boolean; empty?: string }) {
  return (
    <section aria-label={`${title} events`}>
      <h3 className="mb-2 text-xs font-extrabold uppercase tracking-[0.18em] text-muted">{title} · {events.length}</h3>
      {events.length === 0 ? <p className="text-sm text-muted">{empty}</p> : (
        <ul className="space-y-2">{events.map((e) => <li key={e.id}><MyEventRow event={e} past={past} onDeleted={onDeleted} /></li>)}</ul>
      )}
    </section>
  )
}

function MyEventRow({ event: e, past, onDeleted }: { event: NexusEvent; past?: boolean; onDeleted: () => void }) {
  const navigate = useNavigate()
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const month = e.start.toLocaleDateString('en-CA', { month: 'short', timeZone: TIME_ZONE })
  const day = e.start.toLocaleDateString('en-CA', { day: 'numeric', timeZone: TIME_ZONE })

  async function remove() {
    setDeleting(true)
    setError(null)
    try {
      await api(`/api/events/${e.id}`, { method: 'DELETE' })
      onDeleted()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setDeleting(false)
    }
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
          {e.visibility === 'private'
            ? <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 px-2 py-0.5"><Lock className="size-3" aria-hidden />Friends only</span>
            : <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-accent-strong"><Globe className="size-3" aria-hidden />Public</span>}
          <span className="inline-flex items-center gap-1 text-muted"><Users className="size-3.5" aria-hidden />{e.going} going</span>
          {e.lookingForBuddy > 0 && <span className="inline-flex items-center gap-1 text-brand-strong"><Footprints className="size-3.5" aria-hidden />{e.lookingForBuddy} want a buddy</span>}
        </p>
        {error && <p role="alert" className="mt-1 text-sm font-semibold text-danger">{error}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {confirming ? (
          <>
            <span className="text-sm font-bold">Delete this event?</span>
            <Button variant="danger" className="px-3 py-1.5 text-sm" loading={deleting} onClick={remove}>Delete</Button>
            <Button variant="ghost" className="px-3 py-1.5 text-sm" onClick={() => setConfirming(false)} disabled={deleting}>Keep</Button>
          </>
        ) : (
          <>
            {!past && <Button variant="secondary" className="px-3 py-1.5 text-sm" onClick={() => navigate('/', { state: { focusEventId: e.id } })}>View on map</Button>}
            <button type="button" onClick={() => setConfirming(true)} aria-label={`Delete ${e.title}`} title="Delete"
              className="grid size-9 place-items-center rounded-xl text-muted hover:bg-surface-2 hover:text-danger">
              <Trash2 className="size-4.5" aria-hidden />
            </button>
          </>
        )}
      </div>
    </div>
  )
}
