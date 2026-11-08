import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { HandHeart, Check, Search, CalendarDays } from 'lucide-react'
import { api } from '../lib/api'
import { calgaryDay } from '../lib/nexus'
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

export function EventBuddies({ eventId }: { eventId: string }) {
  const [people, setPeople] = useState<{ id: number; name: string }[] | null>(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true
    setPeople(null); setError('')
    const load = () => api<{ people: { id: number; name: string }[] }>(`/api/buddies/events/${eventId}`).then(result => { if (active) { setPeople(result.people); setError('') } }).catch(e => { if (active) setError(e.message) })
    load()
    const interval = setInterval(load, 60000)
    window.addEventListener('corkboard-buddy-updated', load)
    return () => { active = false; clearInterval(interval); window.removeEventListener('corkboard-buddy-updated', load) }
  }, [eventId, retry])
  return <section className="mt-5 rounded-2xl border border-line p-4" aria-label="People open to go together"><div className="flex items-center justify-between gap-2"><h3 className="flex items-center gap-2 font-bold"><HandHeart size={18} />Open to go together {people && <span className="text-muted">({people.length})</span>}</h3><Link to="/profile?section=buddy" className="text-sm font-bold text-brand-strong">My preferences</Link></div><p className="mt-2 text-xs text-muted">People whose availability is shared with you. No match or message is sent.</p>{people && <div className="mt-3 space-y-2">{people.map(p => <div key={p.id} className="flex items-center gap-2"><span className="grid size-8 place-items-center rounded-full bg-brand-tint text-sm font-bold text-brand-strong" aria-hidden>{p.name[0]}</span><span className="text-sm font-bold">{p.name}</span></div>)}{!people.length && <p className="text-sm text-muted">No one has shared availability with you yet.</p>}</div>}{!people && !error && <p className="mt-3 text-sm text-muted">Loading people…</p>}{error && <div role="alert" className="mt-3 text-sm text-danger">{error}<Button variant="ghost" onClick={() => setRetry(v => v + 1)}>Retry</Button></div>}</section>
}
