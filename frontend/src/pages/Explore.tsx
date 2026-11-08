// Main page: the neighbourhood map. Toggle between events around you and the people you follow / connect with,
// filter events by type and social energy, and open any pin or card for details, RSVP and "find a buddy".
import { useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import {
  ArrowLeft, Bell, BellRing, Bookmark, CalendarDays, Check, Clock, ExternalLink, Footprints, Globe, HandHeart, LocateFixed,
  Lock, MapPin, Search, Sparkles, Ticket, UserPlus, Users, X,
} from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { NexusMap, type Selection } from '../components/map/NexusMap'
import { EventBuddies } from '../components/BuddyPreferences'
import { cx, Segmented } from '../components/ui'
import { useApi } from '../hooks/useApi'
import { describe, forecastFor, useWeather, weatherTip } from '../hooks/useWeather'
import { api } from '../lib/api'
import {
  calgaryDay, CALGARY_CENTER, CATEGORIES, distanceKm, fmtDistance, fmtSpan, fmtWhen, fromApi, initials, SOURCE_LABEL, VIBES,
  type ApiEvent, type Category, type LatLng, type NexusEvent, type Person, type Relation, type Vibe,
} from '../lib/nexus'

type Mode = 'events' | 'people'
type When = 'today' | 'week' | 'all'
type Sort = 'near' | 'soon'
type SetToggle = Dispatch<SetStateAction<Set<string>>>

const ALL_CATS = Object.keys(CATEGORIES) as Category[]

/** "Hillhurst Sunnyside Community Association" → "Hillhurst Sunnyside" */
const neighbourhoodOf = (host: string) => host.replace(/\s+(Creekside\s+)?(Community|Communities|Neighbourhoods?)\s+Association$/i, '')
/** Ticketmaster / Meetup hosts are promoters, so show the venue; community events fall back to the neighbourhood. */
const placeOf = (e: NexusEvent) => (e.source && e.source !== 'community' ? e.venue : e.venue || neighbourhoodOf(e.host))

export default function Explore() {
  const [mode, setMode] = useState<Mode>('events')
  const [query, setQuery] = useState('')
  const [cats, setCats] = useState<Set<Category>>(new Set())
  const [vibe, setVibe] = useState<Vibe | 'all'>('all')
  const [when, setWhen] = useState<When>('week')
  const [sort, setSort] = useState<Sort>('near')
  const [radiusKm, setRadiusKm] = useState<number | null>(null)
  const [locationError, setLocationError] = useState('')
  const [relation, setRelation] = useState<Relation | 'all'>('all')
  const [buddyOnly, setBuddyOnly] = useState(false)
  const [selected, setSelected] = useState<Selection>(null)
  const [focus, setFocus] = useState<LatLng | null>(null)
  const [userPos, setUserPos] = useState<LatLng | null>(null)
  const [mapOrigin, setMapOrigin] = useState<LatLng | null>(null)
  const [locating, setLocating] = useState(false)
  const sideRef = useRef<HTMLDivElement>(null)

  // Live events from the backend (Ticketmaster, Meetup, community posts). Refreshes every 5 minutes.
  const { data: apiEvents, error: eventsError, loading: eventsLoading, reload: reloadEvents } =
    useApi<ApiEvent[]>('/api/events?limit=500', { refreshMs: 5 * 60_000 })
  const allEvents = useMemo(() => (apiEvents ?? []).map(fromApi), [apiEvents])

  // Per-user actions, all saved to the (shared) database: RSVP, find a buddy, bookmarks and reminders.
  const [rsvps, setRsvps] = useState<Set<string>>(new Set())
  const [rsvpError, setRsvpError] = useState('')
  const [saved, setSaved] = useState<Set<string>>(new Set())
  const [buddyAsks, setBuddyAsks] = useState<Set<string>>(new Set())
  const [reminders, setReminders] = useState<Set<string>>(new Set())
  const toggle = (set: SetToggle, id: string) =>
    set((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })

  // Bookmarks + "remind me" live in the database so they survive reloads and follow you to other devices.
  const { data: savedState } = useApi<{ saved: string[]; reminders: string[] }>('/api/events/saved')
  useEffect(() => {
    if (!savedState) return
    setSaved(new Set(savedState.saved)); setReminders(new Set(savedState.reminders))
  }, [savedState])
  function setSaveFlags(id: string, next: { saved: boolean; reminder: boolean }) {
    const before = { saved: saved.has(id), reminder: reminders.has(id) }
    setHas(setSaved, id, next.saved); setHas(setReminders, id, next.reminder)
    api(`/api/events/${id}/save`, { method: 'PUT', body: next }).catch(() => {  // roll back if it didn't save
      setHas(setSaved, id, before.saved); setHas(setReminders, id, before.reminder)
    })
  }
  const toggleSaved = (id: string) => setSaveFlags(id, { saved: !saved.has(id), reminder: reminders.has(id) })
  const toggleReminder = (id: string) => setSaveFlags(id, { saved: saved.has(id), reminder: !reminders.has(id) })

  // My people: people you follow who share a neighbourhood (GET /api/social/map-people).
  const { data: peopleData } = useApi<{ people: Person[]; hidden: number }>('/api/social/map-people', { refreshMs: 5 * 60_000 })
  const allPeople = useMemo(() => peopleData?.people ?? [], [peopleData])
  const setHas = (set: SetToggle, id: string, on: boolean) =>
    set((prev) => { const n = new Set(prev); if (on) n.add(id); else n.delete(id); return n })

  // Take my RSVPs from the server whenever events load.
  useEffect(() => {
    if (!apiEvents) return
    const ids = new Set(apiEvents.map((e) => e.id))
    setRsvps(new Set(apiEvents.filter((e) => e.meGoing).map((e) => e.id)))
    setBuddyAsks((prev) => new Set([...[...prev].filter((id) => !ids.has(id)), ...apiEvents.filter((e) => e.meLookingForBuddy).map((e) => e.id)]))
  }, [apiEvents])

  async function saveRsvp(id: string, going: boolean, buddy: boolean) {
    setRsvpError('')
    try {
      await api(`/api/events/${id}/rsvp`, going ? { method: 'PUT', body: { lookingForBuddy: buddy } } : { method: 'DELETE' })
      window.dispatchEvent(new Event('corkboard-buddy-updated'))
    } catch (e) {
      setRsvpError((e as Error).message)
    } finally {
      reloadEvents() // real going / buddy counts
    }
  }
  const rsvpEvent = (id: string) => {
    const going = !rsvps.has(id)
    setHas(setRsvps, id, going)
    if (!going) setHas(setBuddyAsks, id, false)
    void saveRsvp(id, going, going && buddyAsks.has(id))
  }
  const buddyEvent = (id: string) => {
    const buddy = !buddyAsks.has(id)
    setHas(setBuddyAsks, id, buddy)
    if (buddy) setHas(setRsvps, id, true) // asking for a buddy means you're going
    void saveRsvp(id, buddy || rsvps.has(id), buddy)
  }

  const origin = mapOrigin ?? userPos ?? CALGARY_CENTER
  const q = query.trim().toLowerCase()

  const events = useMemo(() => {
    const now = new Date()
    const weekOut = new Date(now); weekOut.setDate(now.getDate() + 7)
    return allEvents
      .filter((e) => cats.size === 0 || e.categories.some((c) => cats.has(c)))
      .filter((e) => vibe === 'all' || e.vibe === vibe)
      .filter((e) => when === 'all' || (when === 'today' ? calgaryDay(e.start) === calgaryDay(now) : e.start <= weekOut))
      .filter((e) => !q || [e.title, e.host, e.venue, e.description].some((s) => s.toLowerCase().includes(q)))
      .map((e) => ({ ...e, km: distanceKm(origin, e.position) }))
      .filter((e) => radiusKm === null || e.km <= radiusKm)
      .sort((a, b) => (sort === 'near' ? a.km - b.km : a.start.getTime() - b.start.getTime()))
  }, [allEvents, cats, vibe, when, q, origin, sort, radiusKm])

  const people = useMemo(() => allPeople
    .filter((p) => relation === 'all' || p.relation === relation)
    .filter((p) => !buddyOnly || p.openToBuddy)
    .filter((p) => !q || [p.name, p.neighbourhood].some((s) => s.toLowerCase().includes(q)))
    .map((p) => ({ ...p, km: distanceKm(origin, p.position) }))
    .sort((a, b) => a.km - b.km), [allPeople, relation, buddyOnly, q, origin])

  const selectedEvent = selected?.kind === 'event' ? allEvents.find((e) => e.id === selected.id) ?? null : null
  const selectedPerson = selected?.kind === 'person' ? allPeople.find((p) => p.id === selected.id) ?? null : null

  // People mode: show the events your people are going to; highlight the selected person's.
  const peopleEvents = useMemo(() => {
    const ids = new Set(people.flatMap((p) => p.goingTo))
    return allEvents.filter((e) => ids.has(e.id))
  }, [allEvents, people])
  const highlight = useMemo(() => {
    if (mode !== 'people') return undefined
    if (selectedPerson) return new Set(selectedPerson.goingTo)
    if (selectedEvent) return new Set([selectedEvent.id])
    return undefined
  }, [mode, selectedPerson, selectedEvent])

  const select = (s: Selection, pos?: LatLng) => { setSelected(s); if (pos) setFocus({ ...pos }) }
  const switchMode = (m: Mode) => { setMode(m); setSelected(null) }

  // On narrow screens the details sit under the map: bring them into view.
  useEffect(() => {
    if (selected && window.innerWidth < 1024) sideRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [selected])

  function locate() {
    setLocationError('')
    if (!navigator.geolocation) { setLocationError('Location is unavailable in this browser. Distances use downtown Calgary.'); return }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (p) => { const pos = { lat: p.coords.latitude, lng: p.coords.longitude }; setMapOrigin(null); setUserPos(pos); setFocus(pos); setSelected(null); setLocating(false) },
      () => { setLocating(false); setLocationError('Could not update your location. Allow location access and try again; distances still use the location shown above.') },
      { enableHighAccuracy: false, timeout: 8000 },
    )
  }

  // Coming from "Create event": clear filters so the new event is visible, then open it on the map.
  const location = useLocation()
  const navigate = useNavigate()
  const focusEventId = (location.state as { focusEventId?: string } | null)?.focusEventId
  useEffect(() => {
    if (!focusEventId) return
    const ev = allEvents.find((e) => e.id === focusEventId)
    if (!ev) return
    setMode('events'); setQuery(''); setCats(new Set()); setVibe('all'); setWhen('all'); setRadiusKm(null)
    select({ kind: 'event', id: ev.id }, ev.position)
    navigate('.', { replace: true, state: null })
  }, [focusEventId, allEvents]) // eslint-disable-line react-hooks/exhaustive-deps

  const filtersActive = cats.size > 0 || vibe !== 'all' || when !== 'week' || radiusKm !== null
  const resetFilters = () => { setCats(new Set()); setVibe('all'); setWhen('week'); setRadiusKm(null) }
  const count = mode === 'events' ? events.length : people.length

  return (
    <div className="h-full overflow-y-auto lg:overflow-hidden">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-4 p-4 md:p-6 lg:h-full">
        {/* Heading + mode toggle */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-accent-strong">Calgary · your neighbourhood</p>
            <h1 className="mt-1 text-3xl font-extrabold tracking-tight">{mode === 'events' ? 'What’s on around you' : 'Your people'}</h1>
          </div>
          <div role="tablist" aria-label="What to show on the map" className="inline-flex rounded-full border border-line bg-surface p-1 shadow-sm">
            <ModeTab active={mode === 'events'} onClick={() => switchMode('events')} icon={<CalendarDays className="size-4.5" aria-hidden />}
              label="Events near you" count={events.length} />
            <ModeTab active={mode === 'people'} onClick={() => switchMode('people')} icon={<Users className="size-4.5" aria-hidden />}
              label="My people" count={people.length} />
          </div>
        </div>

        {/* Search + actions */}
        <div className="flex flex-wrap items-center gap-3">
          <label className="relative min-w-56 flex-1">
            <span className="sr-only">{mode === 'events' ? 'Search events' : 'Search people'}</span>
            <Search className="pointer-events-none absolute left-4 top-1/2 size-4.5 -translate-y-1/2 text-muted" aria-hidden />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder={mode === 'events' ? 'Search events, hosts, venues…' : 'Search people or neighbourhoods…'}
              className="w-full rounded-full border border-line bg-surface py-2.5 pl-11 pr-4 shadow-sm outline-none transition placeholder:text-muted/70 focus:border-brand focus:ring-4 focus:ring-brand/15" />
          </label>
          <button type="button" onClick={locate} disabled={locating} aria-label="Centre the map on my location"
            className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2.5 font-bold shadow-sm transition hover:bg-surface-2 disabled:opacity-60">
            <LocateFixed className={cx('size-4.5', locating && 'animate-spin')} aria-hidden /> Near me
          </button>
        </div>

        {mode === 'events' && <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 text-sm font-bold">
            <MapPin className="size-4 text-brand-strong" aria-hidden /> Distance
            <select value={radiusKm ?? 'all'} onChange={e => { setRadiusKm(e.target.value === 'all' ? null : Number(e.target.value)); setSelected(null) }} className="min-h-8 rounded-lg bg-surface px-2 text-fg">
              <option value="all">Any distance</option>
              {[1, 5, 10, 25, 50, 100].map(km => <option key={km} value={km}>Within {km} km</option>)}
            </select>
          </label>
          {locationError && <p role="status" className="w-full text-sm text-danger">{locationError}</p>}
        </div>}
        {/* Filters */}
        <div className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]">
          {mode === 'events' ? (
            <>
              <div role="group" aria-label="Event type" className="flex shrink-0 gap-2">
                {ALL_CATS.map((c) => {
                  const meta = CATEGORIES[c]
                  const on = cats.has(c)
                  const Icon = meta.icon
                  return (
                    <button key={c} type="button" aria-pressed={on}
                      onClick={() => setCats((prev) => { const n = new Set(prev); if (n.has(c)) n.delete(c); else n.add(c); return n })}
                      className={cx('inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-bold transition',
                        on ? 'border-brand bg-brand-tint text-brand-strong' : 'border-line bg-surface text-muted hover:border-fg/30 hover:text-fg')}>
                      <Icon className={cx('size-4', !on && 'cat-icon')} aria-hidden style={on ? undefined : { color: meta.color }} />
                      {meta.label}
                    </button>
                  )
                })}
              </div>
              <Divider />
              <div className="shrink-0">
                <Segmented label="Social energy" value={vibe} onChange={setVibe} options={[
                  { value: 'all', label: 'Any vibe' },
                  { value: 'introvert', label: 'Introvert' },
                  { value: 'either', label: 'Mixed' },
                  { value: 'extrovert', label: 'Extrovert' },
                ]} />
              </div>
              <Divider />
              <div className="shrink-0">
                <Segmented label="When" value={when} onChange={setWhen} options={[
                  { value: 'today', label: 'Today' },
                  { value: 'week', label: 'This week' },
                  { value: 'all', label: 'Anytime' },
                ]} />
              </div>
              {filtersActive && (
                <button type="button" onClick={resetFilters} className="ml-1 inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-sm font-bold text-brand-strong hover:bg-brand-tint">
                  <X className="size-4" aria-hidden /> Clear
                </button>
              )}
            </>
          ) : (
            <>
              <div className="shrink-0">
                <Segmented label="Relationship" value={relation} onChange={setRelation} options={[
                  { value: 'all', label: 'Everyone' },
                  { value: 'connection', label: 'Connections' },
                  { value: 'following', label: 'Following' },
                ]} />
              </div>
              <Divider />
              <button type="button" aria-pressed={buddyOnly} onClick={() => setBuddyOnly((b) => !b)}
                className={cx('inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-bold transition',
                  buddyOnly ? 'border-brand bg-brand-tint text-brand-strong' : 'border-line bg-surface text-muted hover:text-fg')}>
                <HandHeart className="size-4" aria-hidden /> Open to go together
              </button>
              <p className="ml-2 shrink-0 text-xs text-muted">Demo people · sample neighbourhood locations.</p>
            </>
          )}
        </div>

        {rsvpError && <p role="alert" className="text-sm text-danger">{rsvpError}</p>}
        {/* Map card | cards */}
        <div className="grid gap-5 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <section aria-labelledby="map-title" className="flex h-[60vh] min-h-80 flex-col rounded-3xl border border-line bg-surface/85 p-4 shadow-sm backdrop-blur md:p-5 lg:h-auto lg:min-h-0">
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-accent-strong">Nearby</p>
                <h2 id="map-title" className="text-2xl font-extrabold tracking-tight">Map view</h2>
              </div>
              <p className="text-sm font-semibold text-muted">
                {mode === 'events' ? 'Numbers show attendees looking for a buddy' : 'Green dot: demo buddy availability'}
              </p>
            </div>
            <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-line">
              <NexusMap
                events={mode === 'events' ? events : peopleEvents}
                people={mode === 'people' ? people : []}
                selected={selected}
                onSelect={(s) => setSelected(s)}
                highlightEventIds={highlight}
                userPos={userPos}
                distanceOrigin={mapOrigin}
                onMapClick={mode === 'events' ? position => { setMapOrigin(position); setSelected(null); setLocationError('') } : undefined}
                focus={focus}
              />
            </div>
          </section>

          <div ref={sideRef} className="flex min-w-0 scroll-mt-4 flex-col lg:h-full lg:min-h-0 lg:overflow-hidden">
            {selectedEvent ? (
              <EventDetail event={selectedEvent} km={distanceKm(origin, selectedEvent.position)} onClose={() => setSelected(null)}
                going={rsvps.has(selectedEvent.id)} onRsvp={() => rsvpEvent(selectedEvent.id)}
                buddy={buddyAsks.has(selectedEvent.id)} onBuddy={() => buddyEvent(selectedEvent.id)}
                reminder={reminders.has(selectedEvent.id)} onReminder={() => toggleReminder(selectedEvent.id)}
                saved={saved.has(selectedEvent.id)} onSave={() => toggleSaved(selectedEvent.id)} people={allPeople}
                backLabel={mode === 'events' ? 'All events' : 'All people'}
                onPerson={(p) => { setMode('people'); select({ kind: 'person', id: p.id }, p.position) }} />
            ) : selectedPerson ? (
              <PersonDetail person={selectedPerson} events={allEvents} km={distanceKm(origin, selectedPerson.position)} onClose={() => setSelected(null)}
                asked={buddyAsks.has(selectedPerson.id)} onAsk={() => toggle(setBuddyAsks, selectedPerson.id)}
                onEvent={(e) => select({ kind: 'event', id: e.id }, e.position)} />
            ) : (
              <>
                <div className="mb-3 flex items-center justify-between gap-2 px-1">
                  <p className="font-bold text-muted" aria-live="polite">
                    {mode === 'events' ? `${count} event${count === 1 ? '' : 's'}` : `${count} ${count === 1 ? 'person' : 'people'}`}
                    {mapOrigin ? ' near selected point' : userPos ? ' near you' : ' in Calgary'}
                  </p>
                  {mode === 'events' && (
                    <Segmented label="Sort events" value={sort} onChange={setSort} options={[{ value: 'near', label: 'Nearest' }, { value: 'soon', label: 'Soonest' }]} />
                  )}
                </div>
                <ul aria-label={mode === 'events' ? 'Events' : 'People'} className="space-y-4 pb-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
                  {mode === 'events' && events.map((e) => (
                    <li key={e.id}>
                      <EventCard event={e} km={e.km} going={rsvps.has(e.id)} saved={saved.has(e.id)}
                        onSave={() => toggleSaved(e.id)} onView={() => select({ kind: 'event', id: e.id }, e.position)} />
                    </li>
                  ))}
                  {mode === 'people' && people.map((p) => (
                    <li key={p.id}>
                      <PersonCard person={p} km={p.km} asked={buddyAsks.has(p.id)} onAsk={() => toggle(setBuddyAsks, p.id)}
                        onView={() => select({ kind: 'person', id: p.id }, p.position)} />
                    </li>
                  ))}
                  {count === 0 && (
                    <li className="rounded-3xl border border-dashed border-line px-4 py-12 text-center text-muted" role={mode === 'events' && eventsError ? 'alert' : undefined}>
                      {mode === 'events' && eventsError && !apiEvents ? (
                        <>Couldn’t load events. {eventsError.message}
                          <button type="button" onClick={reloadEvents} className="mt-2 block w-full font-bold text-brand-strong hover:underline">Try again</button></>
                      ) : mode === 'events' && eventsLoading && !apiEvents ? (
                        'Finding events near you…'
                      ) : (
                        <>{mode === 'people' && allPeople.length === 0
                            ? <>No one to show yet. Follow people under Profile → Connections; they appear here once they share a neighbourhood.{!!peopleData?.hidden && ` (${peopleData.hidden} you follow keep their location private.)`}</>
                            : 'Nothing matches yet.'}
                          {mode === 'events' && filtersActive && <button type="button" onClick={resetFilters} className="mt-2 block w-full font-bold text-brand-strong hover:underline">Clear filters</button>}</>
                      )}
                    </li>
                  )}
                </ul>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------- pieces ----------------

function Divider() {
  return <span className="mx-1 h-6 w-px shrink-0 bg-line" aria-hidden />
}

function ModeTab({ active, onClick, icon, label, count }: { active: boolean; onClick: () => void; icon: ReactNode; label: string; count: number }) {
  return (
    <button type="button" role="tab" aria-selected={active} onClick={onClick}
      className={cx('inline-flex items-center gap-2 rounded-full px-4 py-2 font-bold transition',
        active ? 'btn-primary' : 'text-muted hover:text-fg')}>
      {icon}{label}
      <span className={cx('rounded-full px-2 py-0.5 text-xs tabular-nums', active ? 'bg-white/25' : 'bg-surface-2 text-muted')}>{count}</span>
    </button>
  )
}

function Tag({ children }: { children: ReactNode }) {
  return <span className="rounded-full bg-accent-soft px-3 py-1 text-sm font-semibold text-accent-strong">{children}</span>
}

/** "Your event" and "Friends only" markers for events people create in Nexus. */
function OwnerBadges({ event: e }: { event: NexusEvent }) {
  if (!e.mine && e.visibility !== 'private') return null
  return (
    <>
      {e.mine && <span className="inline-flex items-center gap-1 rounded-full bg-brand px-3 py-1 text-sm font-semibold text-white"><Sparkles className="size-3.5" aria-hidden />Your event</span>}
      {e.visibility === 'private' && <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 px-3 py-1 text-sm font-semibold text-fg"><Lock className="size-3.5" aria-hidden />Friends only</span>}
    </>
  )
}

function VibeTag({ vibe }: { vibe: Vibe }) {
  return <span title={VIBES[vibe].hint} className="rounded-full bg-brand-tint px-3 py-1 text-sm font-semibold text-brand-strong">{VIBES[vibe].label}</span>
}

function SaveButton({ saved, onSave, label }: { saved: boolean; onSave: () => void; label: string }) {
  return (
    <button type="button" onClick={onSave} aria-pressed={saved} aria-label={saved ? `Unsave ${label}` : `Save ${label}`} title={saved ? 'Saved' : 'Save'}
      className={cx('grid size-10 place-items-center rounded-full border transition',
        saved ? 'border-brand bg-brand-tint text-brand-strong' : 'border-line bg-surface text-accent-strong hover:border-accent')}>
      <Bookmark className="size-4.5" aria-hidden fill={saved ? 'currentColor' : 'none'} />
    </button>
  )
}

function DistanceBadge({ km }: { km: number }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand-tint px-3 py-1 text-sm font-extrabold text-brand-strong">
      <MapPin className="size-3.5" aria-hidden /> {fmtDistance(km)}
    </span>
  )
}

function EventCard({ event: e, km, going, saved, onSave, onView }: {
  event: NexusEvent; km: number; going: boolean; saved: boolean; onSave: () => void; onView: () => void
}) {
  return (
    <article className="nexus-card rounded-3xl border border-line p-5 shadow-sm transition hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-semibold text-muted">
            <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" aria-hidden />{placeOf(e)}</span>
            <span className="inline-flex items-center gap-1"><Clock className="size-3.5" aria-hidden />{fmtWhen(e.start, e.durationMin)}</span>
            <span className="inline-flex items-center gap-1"><Ticket className="size-3.5" aria-hidden />{e.cost}</span>
          </p>
          <h3 className="mt-1.5 text-xl font-extrabold leading-snug tracking-tight">{e.title}</h3>
          <p className="mt-1 flex flex-wrap gap-x-3 text-sm text-muted">
            <span><strong className="text-fg">{e.going}</strong> going</span>
            {e.lookingForBuddy > 0 && <span className="inline-flex items-center gap-1 text-brand-strong"><Footprints className="size-3.5" aria-hidden />{e.lookingForBuddy} looking for a buddy</span>}
          </p>
        </div>
        <DistanceBadge km={km} />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <OwnerBadges event={e} />
        {e.categories.map((c) => <Tag key={c}>{CATEGORIES[c].label}</Tag>)}
        <VibeTag vibe={e.vibe} />
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button type="button" onClick={onView} className="btn-primary rounded-full px-5 py-2 font-bold">View event</button>
        <SaveButton saved={saved} onSave={onSave} label={e.title} />
        {going && <span className="inline-flex items-center gap-1 text-sm font-bold text-success"><Check className="size-4" aria-hidden /> You’re going</span>}
      </div>
    </article>
  )
}

function Avatar({ person, size = 'md' }: { person: Person; size?: 'sm' | 'md' | 'lg' }) {
  const s = { sm: 'size-8 text-[11px]', md: 'size-12 text-base', lg: 'size-16 text-xl' }[size]
  return <span className={cx('grid shrink-0 place-items-center rounded-full font-extrabold text-white', s)} style={{ background: person.color }} aria-hidden>{initials(person.name)}</span>
}

function PersonCard({ person: p, km, asked, onAsk, onView }: { person: Person; km: number; asked: boolean; onAsk: () => void; onView: () => void }) {
  return (
    <article className="nexus-card rounded-3xl border border-line p-5 shadow-sm transition hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar person={p} />
          <div className="min-w-0">
            <h3 className="truncate text-xl font-extrabold tracking-tight">{p.name}</h3>
            <p className="text-sm font-semibold text-muted"><span className="capitalize">{p.relation}</span> · {p.neighbourhood} · going to {p.goingTo.length}</p>
          </div>
        </div>
        <DistanceBadge km={km} />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {p.interests.map((c) => <Tag key={c}>{CATEGORIES[c].label}</Tag>)}
        {p.openToBuddy && <span className="rounded-full bg-brand-tint px-3 py-1 text-sm font-semibold text-brand-strong">🤝 Open to go together</span>}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" onClick={onView} className="btn-primary rounded-full px-5 py-2 font-bold">View profile</button>
        {p.openToBuddy && (
          <button type="button" onClick={onAsk} aria-pressed={asked}
            className={cx('inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-bold transition',
              asked ? 'border-brand bg-brand-tint text-brand-strong' : 'border-line bg-surface hover:bg-surface-2')}>
            {asked ? <><Check className="size-4" aria-hidden /> Asked</> : <><UserPlus className="size-4" aria-hidden /> Ask to go together</>}
          </button>
        )}
      </div>
    </article>
  )
}

function DetailCard({ label, backLabel, onClose, children }: { label: string; backLabel: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <section aria-label={label} tabIndex={0} className="nexus-card nexus-detail animate-in max-h-[70dvh] overscroll-contain rounded-3xl border border-line p-6 shadow-sm [overflow-wrap:anywhere] [scrollbar-gutter:stable] lg:min-h-0 lg:max-h-full lg:flex-1">
      <button type="button" onClick={onClose} className="-ml-2 mb-3 inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-sm font-bold text-muted hover:bg-surface-2 hover:text-fg">
        <ArrowLeft className="size-4" aria-hidden /> {backLabel}
      </button>
      {children}
    </section>
  )
}

function EventDetail({ event: e, km, onClose, going, onRsvp, buddy, onBuddy, reminder, onReminder, saved, onSave, backLabel, onPerson, people }: {
  event: NexusEvent; km: number; onClose: () => void; people: Person[]
  going: boolean; onRsvp: () => void; buddy: boolean; onBuddy: () => void; reminder: boolean; onReminder: () => void
  saved: boolean; onSave: () => void; backLabel: string
  onPerson: (p: Person) => void
}) {
  const weather = useWeather()
  const f = forecastFor(weather, e.start)
  const tip = weatherTip(f, e.indoor)
  const friends = people.filter((p) => p.goingTo.includes(e.id))

  return (
    <DetailCard label={`Event details: ${e.title}`} backLabel={backLabel} onClose={onClose}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold leading-tight tracking-tight">{e.title}</h2>
          <p className="mt-1 font-semibold text-muted">{e.host}</p>
        </div>
        <SaveButton saved={saved} onSave={onSave} label={e.title} />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <OwnerBadges event={e} />
        {e.categories.map((c) => <Tag key={c}>{CATEGORIES[c].label}</Tag>)}
        <VibeTag vibe={e.vibe} />
      </div>

      <ul className="mt-5 space-y-2.5">
        <li className="flex gap-2.5"><Clock className="mt-0.5 size-4.5 shrink-0 text-accent-strong" aria-hidden />
          {fmtSpan(e.start, e.durationMin)}</li>
        <li className="flex gap-2.5"><MapPin className="mt-0.5 size-4.5 shrink-0 text-accent-strong" aria-hidden />
          <span>{e.venue}<span className="block text-sm text-muted">{e.address} · {fmtDistance(km)} away</span></span></li>
        <li className="flex gap-2.5"><Ticket className="mt-0.5 size-4.5 shrink-0 text-accent-strong" aria-hidden />{e.cost}</li>
      </ul>

      {f && (
        <div className={cx('mt-5 rounded-2xl px-4 py-3 text-sm', tip ? 'bg-brand-tint text-brand-strong' : 'bg-accent-soft text-accent-strong')}>
          <p className="font-bold">
            <span aria-hidden>{describe(f.code).emoji}</span> {describe(f.code).label}, {Math.round(f.min)}° to {Math.round(f.max)}°C
            <span className="font-semibold opacity-80"> · {e.indoor ? 'Indoors' : 'Outdoors'}</span>
          </p>
          {tip && <p className="mt-0.5">{tip}</p>}
        </div>
      )}

      {e.description && <p className="mt-5 leading-relaxed">{e.description}</p>}
      <EventBuddies eventId={e.id} />

      <div className="mt-5 rounded-2xl border border-line bg-surface p-4">
        <p className="flex items-center gap-2 font-bold"><Footprints className="size-4.5 text-brand-strong" aria-hidden />
          {e.lookingForBuddy} {e.lookingForBuddy === 1 ? 'attendee is' : 'attendees are'} looking for someone to go with</p>
        {friends.length > 0 && (
          <div className="mt-3 flex items-center gap-2">
            <div className="flex -space-x-2">
              {friends.map((p) => (
                <button key={p.id} type="button" onClick={() => onPerson(p)} title={p.name} aria-label={`${p.name} is going`} className="rounded-full ring-2 ring-surface">
                  <Avatar person={p} size="sm" />
                </button>
              ))}
            </div>
            <p className="text-sm text-muted">{friends.map((p) => p.name.split(' ')[0]).join(', ')} {friends.length === 1 ? 'is' : 'are'} going</p>
          </div>
        )}
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <button type="button" onClick={onRsvp} aria-pressed={going}
          className={cx('inline-flex items-center gap-1.5 rounded-full px-6 py-2.5 font-bold transition', going ? 'border border-brand bg-brand-tint text-brand-strong' : 'btn-primary')}>
          {going ? <><Check className="size-4" aria-hidden /> Going</> : 'RSVP'}
        </button>
        <button type="button" onClick={onBuddy} aria-pressed={buddy}
          className={cx('inline-flex items-center gap-1.5 rounded-full border px-5 py-2.5 font-bold transition',
            buddy ? 'border-brand bg-brand-tint text-brand-strong' : 'border-line bg-surface hover:bg-surface-2')}>
          {buddy ? <><Check className="size-4" aria-hidden /> Buddy requested</> : <><UserPlus className="size-4" aria-hidden /> Find a buddy</>}
        </button>
        <button type="button" onClick={onReminder} aria-pressed={reminder}
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-2.5 font-bold text-muted hover:bg-surface-2 hover:text-fg">
          {reminder ? <><BellRing className="size-4 text-brand-strong" aria-hidden /> Reminder set, with forecast</> : <><Bell className="size-4" aria-hidden /> Remind me the day before</>}
        </button>
        {e.url && e.source && (
          <a href={e.url} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-5 py-2.5 font-bold transition hover:bg-surface-2">
            <Ticket className="size-4" aria-hidden /> {e.source === 'community' ? 'Event page' : e.source === 'calgary' ? 'More info' : `Tickets on ${SOURCE_LABEL[e.source]}`}
            <ExternalLink className="size-3.5" aria-hidden /><span className="sr-only">(opens in your browser)</span>
          </a>
        )}
      </div>

      <p className="mt-6 border-t border-line pt-5 text-xs text-muted">Hosts speak: {e.languages.join(', ')}</p>
      {e.source && e.source !== 'community' && <p className="mt-1 flex items-center gap-1 text-xs text-muted"><Globe className="size-3.5" aria-hidden /> Live listing from {SOURCE_LABEL[e.source]}</p>}
    </DetailCard>
  )
}

function PersonDetail({ person: p, events, km, onClose, asked, onAsk, onEvent }: {
  person: Person; events: NexusEvent[]; km: number; onClose: () => void; asked: boolean; onAsk: () => void; onEvent: (e: NexusEvent) => void
}) {
  const going = events.filter((e) => p.goingTo.includes(e.id))
  return (
    <DetailCard label={`Profile: ${p.name}`} backLabel="All people" onClose={onClose}>
      <div className="flex items-center gap-4">
        <Avatar person={p} size="lg" />
        <div>
          <h2 className="text-2xl font-extrabold leading-tight tracking-tight">{p.name}</h2>
          <p className="text-muted">{p.neighbourhood} · about {fmtDistance(km)} away</p>
          <span className="mt-1 inline-block rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-bold capitalize">{p.relation}</span>
        </div>
      </div>
      {p.openToBuddy && (
        <p className="mt-5 flex items-center gap-2 rounded-2xl bg-brand-tint px-4 py-3 text-sm font-bold text-brand-strong">
          <HandHeart className="size-4.5" aria-hidden /> Open to going to events together
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {p.interests.map((c) => <Tag key={c}>{CATEGORIES[c].label}</Tag>)}
      </div>
      {p.languages.length > 0 && <p className="mt-3 text-sm text-muted">Speaks {p.languages.join(', ')}</p>}

      <h3 className="mt-6 text-xs font-extrabold uppercase tracking-[0.18em] text-accent-strong">Going to</h3>
      <ul className="mt-2 space-y-2">
        {going.map((e) => (
          <li key={e.id}>
            <button type="button" onClick={() => onEvent(e)} className="w-full rounded-2xl border border-line bg-surface p-3 text-left transition hover:border-brand/50">
              <span className="block font-bold leading-snug">{e.title}</span>
              <span className="text-sm text-muted">{fmtWhen(e.start, e.durationMin)} · {placeOf(e)}</span>
            </button>
          </li>
        ))}
      </ul>
      {p.openToBuddy && (
        <button type="button" onClick={onAsk} aria-pressed={asked}
          className={cx('mt-5 inline-flex w-full items-center justify-center gap-1.5 rounded-full px-5 py-2.5 font-bold transition',
            asked ? 'border border-brand bg-brand-tint text-brand-strong' : 'btn-primary')}>
          {asked ? <><Check className="size-4" aria-hidden /> Asked {p.name.split(' ')[0]}</> : <><UserPlus className="size-4" aria-hidden /> Ask to go together</>}
        </button>
      )}
    </DetailCard>
  )
}
