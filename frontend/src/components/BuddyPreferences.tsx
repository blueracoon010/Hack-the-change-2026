import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { HandHeart, Check, Search, CalendarDays, Settings2, Users } from 'lucide-react'
import { api } from '../lib/api'
import { calgaryDay, initials } from '../lib/nexus'
import { useAuth } from '../context/AuthContext'
import { Button, Card, Switch } from './ui'

type Settings = { mode: 'off' | 'any' | 'selected'; audience: 'everyone' | 'mutual' | 'selected'; event_ids: number[]; people_ids: number[] }
type EventOption = { id: string; title: string; start: string; meLookingForBuddy: boolean }
export function BuddyPreferences() {
  const { user, ready } = useAuth()
  const [settings, setSettings] = useState<Settings | null>(null)
  const [events, setEvents] = useState<EventOption[]>([])
  const [people, setPeople] = useState<{ id: number; name: string }[]>([])
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true
    setSettings(null); setError('')
    if (!ready || !user) return
    Promise.all([api<Settings>('/api/buddies/me'), api<EventOption[]>('/api/events?limit=500'), api<{ people: { id: number; name: string }[]; following: number[] }>('/api/social/me')]).then(([pref, eventList, connections]) => {
      if (!active) return
      const followed = connections.people.filter(p => connections.following.includes(p.id))
      setSettings({ ...pref, people_ids: pref.people_ids.filter(id => followed.some(p => p.id === id)) }); setEvents(eventList); setPeople(followed)
    }).catch(e => { if (active) setError(e.message) })
    return () => { active = false }
  }, [user?.id, ready, retry])
  async function save(e: React.FormEvent) {
    e.preventDefault(); if (!settings) return
    setBusy(true); setError(''); setNotice('')
    try { setSettings(await api<Settings>('/api/buddies/me', { method: 'PUT', body: settings })); setNotice('Go-together preferences saved.'); window.dispatchEvent(new Event('corkboard-buddy-updated')) } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  function toggle(field: 'event_ids' | 'people_ids', id: number) {
    if (!settings) return
    setSettings({ ...settings, [field]: settings[field].includes(id) ? settings[field].filter(v => v !== id) : [...settings[field], id] })
  }
  return <Card><h2 className="flex items-center gap-2 text-xl font-extrabold"><HandHeart className="text-brand-strong" size={22} /> Go together</h2><p className="mt-2 text-sm text-muted">Choose the events and people you’re comfortable going with. This shares availability, not your location.</p>{settings ? <form className="mt-4 space-y-5" onSubmit={save}><Switch label="Open to go together" description="Turn off to hide all your buddy availability." checked={settings.mode !== 'off'} onChange={enabled => setSettings({ ...settings, mode: enabled ? 'selected' : 'off' })} />{settings.mode !== 'off' && <><fieldset><legend className="mb-3 text-sm font-bold">Which events?</legend><div className="flex flex-wrap gap-2">{([{ value: 'any', label: 'Any event' }, { value: 'selected', label: 'Choose events' }] as const).map(o => <Button type="button" key={o.value} variant={settings.mode === o.value ? 'primary' : 'secondary'} aria-pressed={settings.mode === o.value} onClick={() => setSettings({ ...settings, mode: o.value })}>{o.label}</Button>)}</div><p className="mt-2 text-xs text-muted">Being open does not RSVP you to every event.</p>{settings.mode === 'selected' && <div className="mt-4"><label className="flex items-center gap-2 rounded-xl border border-line p-3"><Search size={16} /><span className="sr-only">Search events to go together</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search events…" className="w-full bg-transparent" /></label><p className="my-2 text-xs text-muted">{settings.event_ids.length} selected · upcoming listings</p><div className="max-h-72 space-y-2 overflow-y-auto">{events.filter(e => e.title.toLowerCase().includes(query.toLowerCase())).map(event => <label key={event.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-line p-3 hover:bg-surface-2"><input type="checkbox" checked={settings.event_ids.includes(Number(event.id))} onChange={() => toggle('event_ids', Number(event.id))} className="size-4 accent-[var(--brand)]" /><span><strong className="block text-sm">{event.title}</strong><span className="mt-1 flex items-center gap-1 text-xs text-muted"><CalendarDays size={12} />{calgaryDay(new Date(event.start))}</span></span></label>)}{events.filter(e => e.title.toLowerCase().includes(query.toLowerCase())).length === 0 && <p className="py-5 text-sm text-muted">No matching events.</p>}</div></div>}</fieldset><fieldset><legend className="mb-3 text-sm font-bold">Who can see you’re open to going with them?</legend><div className="flex flex-wrap gap-2">{([{ value: 'everyone', label: 'Everyone' }, { value: 'mutual', label: 'Mutual follows' }, { value: 'selected', label: 'Selected people' }] as const).map(o => <Button key={o.value} type="button" variant={settings.audience === o.value ? 'primary' : 'secondary'} aria-pressed={settings.audience === o.value} onClick={() => setSettings({ ...settings, audience: o.value })}>{o.label}</Button>)}</div><p className="mt-2 text-xs text-muted">{settings.audience === 'everyone' ? 'Visible to any signed-in user viewing the event.' : settings.audience === 'mutual' ? 'Only people you follow who also follow you.' : 'Only the people you choose from your following list.'}</p>{settings.audience === 'selected' && <div className="mt-3 max-h-56 space-y-2 overflow-y-auto">{people.map(person => <label key={person.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-line p-3"><input type="checkbox" checked={settings.people_ids.includes(person.id)} onChange={() => toggle('people_ids', person.id)} className="size-4 accent-[var(--brand)]" /><span className="text-sm font-bold">{person.name}</span></label>)}{!people.length && <p className="text-sm text-muted">Follow people in Connections to select them here.</p>}</div>}</fieldset></>}<Button type="submit" loading={busy}><Check size={16} />Save preferences</Button></form> : !error && <p className="mt-4 text-sm text-muted">{!user && ready ? 'Sign in to manage buddy preferences.' : 'Loading preferences…'}</p>}{notice && <p role="status" className="mt-3 text-sm text-success">{notice}</p>}{error && <div role="alert" className="mt-3"><p className="text-sm text-danger">{error}</p>{!settings && <Button variant="secondary" onClick={() => setRetry(v => v + 1)}>Retry</Button>}</div>}</Card>
}

type Named = { id: number; name: string }
type EventCompanyData = { friends: (Named & { asked: boolean; withMe: boolean })[]; others: number; companions: Named[] }

/** Event details: friends who want company (named, with "I'll go with you"), everyone else as a count only. */
export function EventCompany({ eventId, asking, onChange }: { eventId: string; asking: boolean; onChange?: () => void }) {
  const { user } = useAuth()
  const [data, setData] = useState<EventCompanyData | null>(null)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<number | null>(null)
  useEffect(() => {
    if (!user) return
    let active = true
    setData(null); setError('')
    const load = () => api<EventCompanyData>(`/api/buddies/events/${eventId}`)
      .then(result => { if (active) { setData(result); setError('') } })
      .catch(e => { if (active) setError((e as Error).message) })
    load()
    const interval = setInterval(load, 60000)
    window.addEventListener('corkboard-buddy-updated', load)
    return () => { active = false; clearInterval(interval); window.removeEventListener('corkboard-buddy-updated', load) }
  }, [eventId, user])

  async function goWith(person: Named, on: boolean) {
    setBusyId(person.id); setError('')
    try {
      setData(await api<EventCompanyData>(`/api/buddies/events/${eventId}/go-with/${person.id}`, { method: on ? 'POST' : 'DELETE' }))
      window.dispatchEvent(new Event('corkboard-buddy-updated'))
      onChange?.()
    } catch (e) { setError((e as Error).message) } finally { setBusyId(null) }
  }

  if (!user) return null
  const friends = data?.friends ?? []
  const others = data?.others ?? 0
  const companions = data?.companions ?? []
  const first = (name: string) => name.split(' ')[0]
  return (
    <section className="mt-5 rounded-2xl border border-line p-4" aria-label="Who wants company">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-semibold"><HandHeart size={18} className="text-brand-strong" aria-hidden />Wants company</h3>
        <Link to="/profile?section=buddy" title="Who can see that I want company" aria-label="Go-together settings"
          className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg"><Settings2 size={16} aria-hidden /></Link>
      </div>
      {asking && (
        <p className="mt-2 text-sm text-brand-strong">
          {companions.length ? <><strong className="font-semibold">{companions.map(c => first(c.name)).join(', ')}</strong> {companions.length === 1 ? 'is' : 'are'} going with you</> : 'You asked for a buddy'}
        </p>
      )}
      {!data && !error && <p className="mt-3 text-sm text-muted">Loading…</p>}
      {data && (
        <div className="mt-3 space-y-2.5">
          {friends.map(f => (
            <div key={f.id} className="flex items-center gap-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-mustard text-[11px] font-bold text-navy" aria-hidden>{initials(f.name)}</span>
              <Link to={`/people/${f.id}`} className="min-w-0 flex-1 truncate text-sm font-semibold hover:underline">{f.name}</Link>
              <Button variant={f.withMe ? 'secondary' : 'primary'} loading={busyId === f.id} onClick={() => goWith(f, !f.withMe)}
                aria-pressed={f.withMe} className="h-8 shrink-0 px-3 text-[13px]">
                {f.withMe ? <><Check size={14} aria-hidden />Going together</> : 'I’ll go with you'}
              </Button>
            </div>
          ))}
          {others > 0 && (
            <p className="flex items-center gap-2 text-sm text-muted" title="Only friends are named. Nobody’s location is shared.">
              <span className="grid size-8 place-items-center rounded-full bg-surface-2" aria-hidden><Users size={15} /></span>
              {friends.length ? `+${others} more` : `${others} ${others === 1 ? 'person' : 'people'}`} open to meeting
            </p>
          )}
          {!friends.length && !others && <p className="text-sm text-muted">No one yet</p>}
        </div>
      )}
      {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
    </section>
  )
}
