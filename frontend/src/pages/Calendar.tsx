import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CalendarDays, CalendarHeart, ChevronLeft, ChevronRight, Download, ExternalLink, MapPin, RefreshCw } from 'lucide-react'
import { useApi } from '../hooks/useApi'
import { api } from '../lib/api'
import { calgaryDay, fmtTime, fmtWhen, fromApi, isAllDay, TIME_ZONE, type ApiEvent, type NexusEvent } from '../lib/nexus'
import { Button, Card, ErrorState, Loading } from '../components/ui'

type CalendarEvent = NexusEvent & { endDate: Date }
const dateAtNoon = (key: string) => new Date(`${key}T12:00:00Z`)
const utcStamp = (date: Date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
const keyOf = (date: Date) => date.toISOString().slice(0, 10)
function googleLink(event: CalendarEvent) {
  const params = new URLSearchParams({ action: 'TEMPLATE', text: event.title, dates: `${utcStamp(event.start)}/${utcStamp(event.endDate)}`, ctz: TIME_ZONE, location: [event.venue, event.address].filter(Boolean).join(', '), details: [event.description, event.url].filter(Boolean).join('\n\n') })
  return `https://calendar.google.com/calendar/render?${params}`
}

export default function Calendar() {
  const today = calgaryDay(new Date())
  const [month, setMonth] = useState(() => { const date = dateAtNoon(today); return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 12)) })
  const [selectedDay, setSelectedDay] = useState(today)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  const [notice, setNotice] = useState('')
  const navigate = useNavigate()
  const { data, loading, error, reload } = useApi<ApiEvent[]>('/api/events/attending', { refreshMs: 60000 })
  useEffect(() => {
    const refresh = () => { void reload() }
    window.addEventListener('corkboard-buddy-updated', refresh)
    return () => window.removeEventListener('corkboard-buddy-updated', refresh)
  }, [reload])
  const events = useMemo<CalendarEvent[]>(() => (data ?? []).map(event => ({ ...fromApi(event), endDate: event.end ? new Date(event.end) : new Date(new Date(event.start).getTime() + event.durationMin * 60000) })), [data])
  const onDay = (key: string) => events.filter(e => calgaryDay(e.start) <= key && calgaryDay(new Date(e.endDate.getTime() - 1)) >= key)
  const selected = onDay(selectedDay)
  const days = Array.from({ length: 42 }, (_, i) => new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1 - month.getUTCDay() + i, 12)))
  const monthPrefix = keyOf(month).slice(0, 7)
  const monthCount = events.filter(e => calgaryDay(e.start).slice(0, 7) <= monthPrefix && calgaryDay(new Date(e.endDate.getTime() - 1)).slice(0, 7) >= monthPrefix).length
  function moveMonth(offset: number) { const next = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + offset, 1, 12)); setMonth(next); setSelectedDay(keyOf(next)) }
  async function exportCalendar() {
    setExporting(true); setExportError(''); setNotice('')
    try {
      const content = await api<string>('/api/events/attending/calendar.ics', { responseType: 'text' })
      const url = URL.createObjectURL(new Blob([content], { type: 'text/calendar;charset=utf-8' }))
      const link = Object.assign(document.createElement('a'), { href: url, download: 'nexus-upcoming.ics' })
      document.body.appendChild(link); link.click(); link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 10000)
      setNotice('Calendar downloaded. Import the file into Google Calendar.')
    } catch (e) { setExportError((e as Error).message) } finally { setExporting(false) }
  }
  return <div className="space-y-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="flex items-center gap-2 text-2xl font-extrabold"><CalendarDays className="text-brand-strong" />My calendar</h2><p className="mt-1 text-sm text-muted">Events you’ve RSVPed to · Calgary time</p></div><div className="flex flex-wrap gap-2"><Link to="/plan" className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 font-bold text-white shadow-sm shadow-brand/30 hover:brightness-110"><CalendarHeart size={17} aria-hidden />Find a time with friends</Link><Button variant="secondary" onClick={exportCalendar} disabled={!events.some(e => e.endDate.getTime() > Date.now()) || !!error} loading={exporting}><Download size={17} />Export upcoming (.ics)</Button></div></div>
    <details className="rounded-xl border border-line bg-surface px-4 py-3 text-sm"><summary className="cursor-pointer font-bold text-muted">Use with Google Calendar</summary><p className="mt-2 text-muted">Add individual events below, or export your upcoming events. On Google Calendar’s website, open Settings → Import & export → select the .ics file → Import. Exports are copies; cancellations and changes won’t sync automatically.</p><p className="mt-2 text-muted">Private events are included in your export. Choose a private destination calendar if you want to keep them private.</p><a href="https://support.google.com/calendar/answer/37118" target="_blank" rel="noreferrer" className="mt-2 inline-block font-bold text-brand-strong">Google import instructions ↗</a></details>
    {notice && <p role="status" className="text-sm text-success">{notice}</p>}{exportError && <p role="alert" className="text-sm text-danger">{exportError}</p>}
    {error ? <ErrorState message={error.message} onRetry={reload} /> : loading && !data ? <Loading label="Loading your calendar" /> : <><div className="grid items-start gap-5 xl:grid-cols-[1.5fr_1fr]"><Card><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-xl font-extrabold" aria-live="polite">{month.toLocaleDateString('en-CA', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</h3><p className="text-xs text-muted">{monthCount} {monthCount === 1 ? 'event' : 'events'} this month</p></div><div className="flex items-center gap-1"><button type="button" className="rounded-xl p-2 hover:bg-surface-2" aria-label="Previous month" onClick={() => moveMonth(-1)}><ChevronLeft size={20} /></button><Button variant="ghost" className="px-2 py-1 text-sm" onClick={() => { const now = dateAtNoon(today); setMonth(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 12))); setSelectedDay(today) }}>Today</Button><button type="button" className="rounded-xl p-2 hover:bg-surface-2" aria-label="Next month" onClick={() => moveMonth(1)}><ChevronRight size={20} /></button><button type="button" className="rounded-xl p-2 hover:bg-surface-2" aria-label="Refresh calendar" onClick={reload} disabled={loading}><RefreshCw size={16} /></button></div></div><div className="grid grid-cols-7 gap-1" role="group" aria-label="Calendar dates">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => <div key={day} className="pb-2 text-center text-xs font-bold text-muted">{day}</div>)}{days.map(date => {
      const key = keyOf(date); const dayEvents = onDay(key); const active = key === selectedDay; const currentMonth = date.getUTCMonth() === month.getUTCMonth()
      return <button type="button" key={key} aria-pressed={active} aria-current={key === today ? 'date' : undefined} aria-label={`${date.toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}, ${dayEvents.length} events`} onClick={() => { setSelectedDay(key); if (!currentMonth) setMonth(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 12))) }} className={`flex min-h-16 min-w-0 flex-col items-center gap-1 rounded-xl border px-1 py-2 transition sm:min-h-20 ${active ? 'border-brand bg-brand-tint text-brand-strong' : 'border-transparent hover:bg-surface-2'} ${!currentMonth ? 'text-muted opacity-50' : ''}`}><span className={`grid size-7 place-items-center rounded-full text-sm font-bold ${key === today ? 'bg-brand text-white' : ''}`}>{date.getUTCDate()}</span>{dayEvents.length > 0 && <><span className="flex gap-0.5" aria-hidden>{dayEvents.slice(0, 3).map(e => <span key={e.id} className="size-1.5 rounded-full bg-brand" />)}</span><span className="hidden text-[10px] font-bold sm:block">{dayEvents.length} {dayEvents.length === 1 ? 'event' : 'events'}</span></>}</button>
    })}</div></Card><Card><h3 className="text-lg font-extrabold">{dateAtNoon(selectedDay).toLocaleDateString('en-CA', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' })}</h3><div className="mt-4 space-y-4" aria-live="polite">{selected.map(event => <article key={event.id} className="rounded-2xl border border-line p-4"><p className="text-xs font-bold text-brand-strong">{isAllDay(event.start, event.durationMin) ? fmtWhen(event.start, event.durationMin) : <>{fmtTime(event.start)} – {fmtTime(event.endDate)}{calgaryDay(event.start) !== calgaryDay(event.endDate) && ' · multi-day'}</>}</p><h4 className="mt-2 font-extrabold">{event.title}</h4><p className="mt-2 flex items-start gap-1 text-sm text-muted"><MapPin size={14} className="mt-1 shrink-0" />{event.venue || event.address || 'See event details'}</p>{event.visibility === 'private' && <p className="mt-2 text-xs text-muted">Friends-only event</p>}<div className="mt-4 flex flex-wrap gap-3"><button type="button" onClick={() => navigate('/', { state: { focusEventId: event.id } })} className="text-sm font-bold text-brand-strong">View event</button><a href={googleLink(event)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-bold text-brand-strong">Add to Google Calendar <ExternalLink size={13} /></a></div></article>)}{selected.length === 0 && <div className="py-8 text-center"><CalendarDays className="mx-auto mb-3 size-8 text-muted" aria-hidden /><p className="text-sm text-muted">No plans for this day.</p><Link to="/" className="mt-3 inline-block text-sm font-bold text-brand-strong">Explore events</Link></div>}</div></Card></div>{events.length === 0 && <p className="text-center text-sm text-muted">RSVP to an event on Explore to add it to your calendar.</p>}</>}
  </div>
}
