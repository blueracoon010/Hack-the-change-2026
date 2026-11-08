// Plan with friends: see your week next to your friends' weeks, find when you're all free, and turn that
// window into a plan (with real events that fit it). Friends only ever see *when* you're busy, never what.
import { useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  CalendarCheck, CalendarPlus, Check, ChevronLeft, ChevronRight, Clock, Copy, ExternalLink, FileUp, Lock,
  MapPin, Plus, RefreshCw, Repeat, Sparkles, Trash2, UserPlus, Users, X,
} from 'lucide-react'
import { Alert, Button, Card, cx, Field, Switch } from '../components/ui'
import { api } from '../lib/api'
import { calgaryDay, CATEGORIES, fmtCalgary, fromCalgaryInput, type Category } from '../lib/nexus'
import {
  addDays, BLOCKABLE, calgaryOffset, DAY_END_H, DAY_START_H, dayLabel, fmtClock, fmtHours, fmtRange, KINDS, minutesInto, PERSON_COLORS,
  type Busy, type Friend, type FreeWindow, type Kind, type ScheduleSettings, type Week,
} from '../lib/schedule'

const HOUR_PX = 40
const HOURS = Array.from({ length: DAY_END_H - DAY_START_H }, (_, i) => DAY_START_H + i)
const GRID_H = HOURS.length * HOUR_PX
const clip = (min: number) => Math.min(Math.max(min, DAY_START_H * 60), DAY_END_H * 60)
const topOf = (min: number) => ((clip(min) - DAY_START_H * 60) / 60) * HOUR_PX
const hourLabel = (h: number) => `${((h + 11) % 12) + 1} ${h < 12 || h === 24 ? 'a.m.' : 'p.m.'}`
const initials = (name: string) => name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()

type Draft = { day: string; from: string; to: string; kind: Kind; label: string; repeat: boolean }

export default function Plan() {
  const navigate = useNavigate()
  const today = calgaryDay(new Date())
  const [start, setStart] = useState(today)
  const [friends, setFriends] = useState<Friend[] | null>(null)
  const [picked, setPicked] = useState<number[]>([])
  const [week, setWeek] = useState<Week | null>(null)
  const [settings, setSettings] = useState<ScheduleSettings | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<number | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [showCalendar, setShowCalendar] = useState(false)
  const [openBlock, setOpenBlock] = useState<Busy | null>(null)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    api<Friend[]>('/api/schedule/friends').then(list => {
      setFriends(list)
      setPicked(list.filter(f => f.sharing).slice(0, 3).map(f => f.id))
    }).catch(e => setError(e.message))
    api<ScheduleSettings>('/api/schedule/settings').then(setSettings).catch(() => {})
  }, [])

  async function load() {
    setLoading(true)
    try {
      setWeek(await api<Week>(`/api/schedule/week?start=${start}&with=${picked.join(',')}&offset=${calgaryOffset(start)}`)); setError('')
    } catch (e) { setError((e as Error).message) } finally { setLoading(false) }
  }
  useEffect(() => { if (friends) { void load(); setSelected(null) } }, [start, picked.join(','), friends === null]) // eslint-disable-line react-hooks/exhaustive-deps

  const windows = week?.together ?? []
  const best = useMemo(() => windows.map((w, i) => ({ ...w, i, fits: week!.fits.filter(f => f.window === i).length }))
    .sort((a, b) => Number(b.preferred) - Number(a.preferred) || b.fits - a.fits || b.minutes - a.minutes).slice(0, 5), [week]) // eslint-disable-line react-hooks/exhaustive-deps
  const sel = selected !== null ? windows[selected] : null
  const others = week?.people.filter(p => !p.me && p.sharing) ?? []
  const names = others.map(p => p.name.split(' ')[0])

  function toggleFriend(id: number) { setPicked(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id].slice(-8)) }
  function flash(text: string) { setNotice(text); setTimeout(() => setNotice(''), 2500) }

  function startDraft(day: string, hour = 18) {
    const h = Math.min(Math.max(hour, DAY_START_H), DAY_END_H - 1)
    setDraft({ day, from: `${String(h).padStart(2, '0')}:00`, to: `${String(h + 1).padStart(2, '0')}:00`, kind: 'busy', label: '', repeat: false })
  }
  function clickColumn(day: string, e: MouseEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return
    const y = e.clientY - e.currentTarget.getBoundingClientRect().top
    startDraft(day, DAY_START_H + Math.floor(y / HOUR_PX))
  }
  async function removeBlock(b: Busy) {
    if (!b.id) return
    try { await api(`/api/schedule/blocks/${b.id}`, { method: 'DELETE' }); setOpenBlock(null); await load() } catch (e) { setError((e as Error).message) }
  }
  function planIt(w: FreeWindow) {
    const day = calgaryDay(new Date(w.start))
    navigate('/create', { state: { prefill: { day, visibility: 'private', title: names.length ? `Hangout with ${names.join(', ')}` : '', description: `${dayLabel(day, { weekday: 'long', month: 'short', day: 'numeric' })}, ${fmtRange(w.start, w.end)}` } } })
  }
  async function copyInvite(w: FreeWindow) {
    const day = dayLabel(calgaryDay(new Date(w.start)), { weekday: 'long', month: 'short', day: 'numeric' })
    try { await navigator.clipboard.writeText(`We're all free ${day}, ${fmtRange(w.start, w.end)}. Want to get together?`); flash('Invite copied') } catch { flash('Copy failed') }
  }

  if (friends === null && !error) return <p className="py-16 text-center text-muted" role="status">Loading…</p>

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Plan with friends</h1>
          <p className="mt-1 text-muted">Find a time that works for everyone, without the group chat back-and-forth.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setShowCalendar(true)}>
            <CalendarCheck size={17} aria-hidden />{settings?.calendar ? settings.calendar.provider : 'Connect calendar'}
          </Button>
          <Button onClick={() => startDraft(start)}><Plus size={17} aria-hidden />Block time</Button>
        </div>
      </header>

      {error && <Alert>{error}</Alert>}
      <p role="status" className="sr-only">{notice}</p>
      {notice && <div className="fixed bottom-24 left-1/2 z-40 -translate-x-1/2 rounded-full bg-fg px-4 py-2 text-sm font-bold text-bg shadow-lg md:bottom-8" aria-hidden>{notice}</div>}

      {/* At a glance */}
      <div className="grid grid-cols-3 gap-3">
        <Stat icon={Users} value={others.length} label={others.length === 1 ? 'friend' : 'friends'} />
        <Stat icon={Clock} value={week ? `${week.freeHoursTogether}h` : '–'} label="free together" />
        <Stat icon={MapPin} value={week ? new Set(week.fits.map(f => f.id)).size : '–'} label="events that fit" />
      </div>

      {/* Who's in */}
      <Card className="flex flex-wrap items-center gap-x-6 gap-y-3 py-4">
        <h2 className="flex items-center gap-2 font-extrabold"><Users size={18} className="text-brand-strong" aria-hidden />Who's in?</h2>
        <div className="flex flex-1 flex-wrap gap-2">
          <PersonChip name="You" color={PERSON_COLORS[0]} active fixed />
          {friends?.map(f => {
            const idx = week?.people.findIndex(p => p.id === f.id) ?? -1
            return <PersonChip key={f.id} name={f.name} color={PERSON_COLORS[idx > 0 ? idx % PERSON_COLORS.length : 1]} active={picked.includes(f.id)}
              locked={!f.sharing} onClick={() => f.sharing && toggleFriend(f.id)} />
          })}
          {friends?.length === 0 && <Link to="/profile?section=social" className="flex items-center gap-2 rounded-full border border-dashed border-line px-3 py-1.5 text-sm font-bold text-brand-strong hover:bg-surface-2"><UserPlus size={15} aria-hidden />Invite a friend</Link>}
        </div>
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold text-muted" aria-label="Legend">
          {(['work', 'class', 'me_time', 'open', 'event'] as Kind[]).map(k => { const Icon = KINDS[k].icon; return <li key={k} className="flex items-center gap-1"><Icon size={13} aria-hidden />{KINDS[k].label}</li> })}
          <li className="flex items-center gap-1"><span className="size-3 rounded-sm bg-success/25 ring-1 ring-success" aria-hidden />All free</li>
        </ul>
      </Card>

      <div className="grid items-start gap-6 xl:grid-cols-[1fr_20rem]">
        {/* Week grid */}
        <Card className="min-w-0 p-0">
          <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
            <div className="flex items-center gap-1">
              <button type="button" className="rounded-lg p-2 hover:bg-surface-2 disabled:opacity-40" aria-label="Previous week" disabled={start <= today} onClick={() => setStart(s => s <= addDays(today, 7) ? today : addDays(s, -7))}><ChevronLeft size={18} /></button>
              <button type="button" className="rounded-lg p-2 hover:bg-surface-2" aria-label="Next week" onClick={() => setStart(s => addDays(s, 7))}><ChevronRight size={18} /></button>
              <p className="ml-1 font-extrabold" aria-live="polite">{dayLabel(start, { month: 'short', day: 'numeric' })} – {dayLabel(addDays(start, 6), { month: 'short', day: 'numeric' })}</p>
            </div>
            <div className="flex items-center gap-1">
              {start !== today && <Button variant="ghost" className="px-2 py-1 text-sm" onClick={() => setStart(today)}>Today</Button>}
              <button type="button" className="rounded-lg p-2 hover:bg-surface-2" aria-label="Refresh" onClick={load} disabled={loading}><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /></button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[640px] px-2 pb-3">
              <div className="grid grid-cols-[3.25rem_repeat(7,1fr)]">
                <div />
                {(week?.days ?? Array.from({ length: 7 }, (_, i) => addDays(start, i))).map(d => (
                  <div key={d} className={cx('py-2 text-center text-xs font-bold', d === today ? 'text-brand-strong' : 'text-muted')}>{dayLabel(d)}</div>
                ))}
              </div>
              <div className="grid grid-cols-[3.25rem_repeat(7,1fr)]" style={{ height: GRID_H }}>
                <div className="relative">
                  {HOURS.map(h => <span key={h} className="absolute right-1.5 -translate-y-1/2 whitespace-nowrap text-[10px] font-semibold text-muted" style={{ top: (h - DAY_START_H) * HOUR_PX }}>{h > DAY_START_H && hourLabel(h)}</span>)}
                </div>
                {(week?.days ?? []).map(day => (
                  <div key={day} className="relative cursor-copy border-l border-line" onClick={e => clickColumn(day, e)}
                    style={{ backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${HOUR_PX - 1}px, var(--line) ${HOUR_PX - 1}px, var(--line) ${HOUR_PX}px)` }}
                    aria-label={`${dayLabel(day, { weekday: 'long', month: 'short', day: 'numeric' })}. Click to block time.`}>
                    {windows.map((w, i) => {
                      if (calgaryDay(new Date(w.start)) !== day) return null
                      const t = topOf(minutesInto(day, w.start)), b = topOf(minutesInto(day, w.end))
                      return <button key={i} type="button" onClick={() => setSelected(i)} title={`Everyone free ${fmtRange(w.start, w.end)}`}
                        className={cx('absolute inset-x-0.5 flex items-start rounded-md border-l-4 border-success px-1 pt-0.5 text-left transition', selected === i ? 'bg-success/35 ring-2 ring-success' : 'bg-success/15 hover:bg-success/30', w.preferred && 'ring-1 ring-success')}
                        style={{ top: t, height: b - t }}>
                        {b - t >= 28 && <span className="block truncate text-[10px] font-extrabold uppercase tracking-wide text-success" aria-hidden>All free</span>}
                        <span className="sr-only">Everyone free {fmtRange(w.start, w.end)}</span>
                      </button>
                    })}
                    {week!.people.map((p, pi) => {
                      const lanes = week!.people.length, color = PERSON_COLORS[pi % PERSON_COLORS.length]
                      return p.busy.map((b, bi) => {
                        const s = minutesInto(day, b.start), e = minutesInto(day, b.end)
                        if (e <= DAY_START_H * 60 || s >= DAY_END_H * 60 || clip(e) - clip(s) <= 0) return null
                        const Icon = KINDS[b.kind]?.icon
                        const open = b.kind === 'open'
                        const style = { top: topOf(s), height: Math.max(topOf(e) - topOf(s), 6), left: `calc(${(pi / lanes) * 100}% + 2px)`, width: `calc(${100 / lanes}% - 4px)`, ...(open ? { borderColor: color, color } : { background: color }) }
                        const tip = `${p.me ? 'You' : p.name}: ${b.label || KINDS[b.kind]?.label} ${fmtRange(b.start, b.end)}`
                        return <button key={`${p.id}-${bi}`} type="button" title={tip} aria-label={tip}
                          onClick={() => p.me && (b.id ? setOpenBlock(b) : b.eventId && navigate('/', { state: { focusEventId: b.eventId } }))}
                          className={cx('absolute z-10 grid place-items-start overflow-hidden rounded-md p-0.5', open ? 'border-2 border-dashed bg-surface/70' : 'text-white opacity-90 hover:opacity-100', !p.me && 'cursor-default')}
                          style={style}>
                          {Icon && topOf(e) - topOf(s) > 18 && <Icon size={12} aria-hidden />}
                        </button>
                      })
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>

        {/* Best times + what to do */}
        <div className="space-y-4">
          <Card>
            <h2 className="flex items-center gap-2 font-extrabold"><Sparkles size={18} className="text-brand-strong" aria-hidden />Best times</h2>
            {week && best.length === 0 && <p className="mt-3 text-sm text-muted">No shared free time this week. Try next week or fewer people.</p>}
            <ul className="mt-3 space-y-2">
              {best.map(w => (
                <li key={w.i}>
                  <button type="button" onClick={() => setSelected(w.i)} aria-pressed={selected === w.i}
                    className={cx('flex w-full items-center gap-3 rounded-xl border p-3 text-left transition', selected === w.i ? 'border-success bg-success/10' : 'border-line hover:bg-surface-2')}>
                    <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-surface-2 text-center leading-none">
                      <span className="text-[10px] font-bold uppercase text-muted">{dayLabel(calgaryDay(new Date(w.start)), { weekday: 'short' })}<br /><span className="text-base text-fg">{dayLabel(calgaryDay(new Date(w.start)), { day: 'numeric' })}</span></span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold">{fmtRange(w.start, w.end)}</span>
                      <span className="flex items-center gap-2 text-xs text-muted"><Clock size={12} aria-hidden />{fmtHours(w.minutes)}{w.fits > 0 && <><MapPin size={12} aria-hidden />{w.fits}</>}</span>
                    </span>
                    {w.preferred && <Sparkles size={16} className="shrink-0 text-success" aria-label="Someone marked this open to plans" />}
                  </button>
                </li>
              ))}
            </ul>
          </Card>

          {sel && <Card className="space-y-4" aria-labelledby="sel-h">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 id="sel-h" className="font-extrabold">{dayLabel(calgaryDay(new Date(sel.start)), { weekday: 'long', month: 'short', day: 'numeric' })}</h2>
                <p className="text-sm font-bold text-success">{fmtRange(sel.start, sel.end)} · everyone free</p>
              </div>
              <button type="button" onClick={() => setSelected(null)} className="rounded-lg p-1 text-muted hover:bg-surface-2" aria-label="Close"><X size={18} /></button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => planIt(sel)}><CalendarPlus size={16} aria-hidden />Make a plan</Button>
              <Button variant="secondary" onClick={() => copyInvite(sel)}><Copy size={16} aria-hidden />Copy invite</Button>
            </div>
            {week!.fits.filter(f => f.window === selected).length > 0 && <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Happening then</p>
              <ul className="space-y-2">
                {week!.fits.filter(f => f.window === selected).map(f => {
                  const cat = CATEGORIES[f.categories[0] as Category]; const Icon = cat?.icon ?? MapPin
                  return <li key={f.id}>
                    <button type="button" onClick={() => navigate('/', { state: { focusEventId: f.id } })} className="flex w-full items-start gap-3 rounded-xl border border-line p-3 text-left hover:bg-surface-2">
                      <span className="grid size-9 shrink-0 place-items-center rounded-lg text-white" style={{ background: cat?.color ?? 'var(--brand)' }}><Icon size={16} aria-hidden /></span>
                      <span className="min-w-0 flex-1"><span className="block text-sm font-bold leading-snug">{f.title}</span><span className="block truncate text-xs text-muted">{fmtClock(f.start)}{f.venue && ` · ${f.venue}`}</span></span>
                      <ExternalLink size={14} className="mt-1 shrink-0 text-muted" aria-hidden />
                    </button>
                  </li>
                })}
              </ul>
            </div>}
          </Card>}
        </div>
      </div>

      {draft && <BlockDialog draft={draft} onClose={() => setDraft(null)} onSaved={() => { setDraft(null); flash('Time blocked'); void load() }} />}
      {openBlock && <Modal title={openBlock.label || KINDS[openBlock.kind].label} onClose={() => setOpenBlock(null)}>
        <p className="flex items-center gap-2 text-muted"><Clock size={16} aria-hidden />{dayLabel(calgaryDay(new Date(openBlock.start)), { weekday: 'short', month: 'short', day: 'numeric' })}, {fmtRange(openBlock.start, openBlock.end)}</p>
        {openBlock.repeat && <p className="mt-2 flex items-center gap-2 text-muted"><Repeat size={16} aria-hidden />Every week</p>}
        {openBlock.source === 'calendar' && <p className="mt-2 flex items-center gap-2 text-muted"><CalendarCheck size={16} aria-hidden />From your calendar</p>}
        <div className="mt-5 flex gap-2">
          {openBlock.source === 'manual' && <Button variant="danger" onClick={() => removeBlock(openBlock)}><Trash2 size={16} aria-hidden />Remove</Button>}
          <Button variant="ghost" onClick={() => setOpenBlock(null)}>Close</Button>
        </div>
      </Modal>}
      {showCalendar && settings && <CalendarDialog settings={settings} onClose={() => setShowCalendar(false)} onChange={s => { setSettings(s); void load() }} />}
    </div>
  )
}

function Stat({ icon: Icon, value, label }: { icon: typeof Users; value: string | number; label: string }) {
  return <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 sm:p-4">
    <span className="hidden size-10 shrink-0 place-items-center rounded-xl bg-brand-tint text-brand-strong sm:grid"><Icon size={20} aria-hidden /></span>
    <span><span className="block text-xl font-extrabold tabular-nums sm:text-2xl">{value}</span><span className="text-xs font-bold text-muted">{label}</span></span>
  </div>
}

function PersonChip({ name, color, active, fixed, locked, onClick }: { name: string; color: string; active: boolean; fixed?: boolean; locked?: boolean; onClick?: () => void }) {
  return <button type="button" onClick={onClick} disabled={fixed || locked} aria-pressed={active}
    title={locked ? `${name} isn't sharing their schedule` : undefined}
    className={cx('flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm font-bold transition', active ? 'border-transparent bg-surface-2' : 'border-line text-muted hover:bg-surface-2', locked && 'opacity-60', fixed && 'cursor-default')}>
    <span className="grid size-7 place-items-center rounded-full text-xs text-white" style={{ background: active ? color : 'var(--muted)' }} aria-hidden>{initials(name)}</span>
    <span className="truncate">{name}</span>
    {locked ? <Lock size={13} aria-label="Not sharing" /> : active && !fixed ? <Check size={14} aria-hidden /> : null}
  </button>
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    ref.current?.querySelector<HTMLElement>('input, select, button')?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onMouseDown={e => e.target === e.currentTarget && onClose()}>
    <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-line bg-surface p-6 shadow-xl">
      <div className="mb-4 flex items-center justify-between gap-2"><h2 className="text-xl font-extrabold">{title}</h2>
        <button type="button" onClick={onClose} className="rounded-lg p-1 text-muted hover:bg-surface-2" aria-label="Close"><X size={20} /></button></div>
      {children}
    </div>
  </div>
}

function BlockDialog({ draft: initial, onClose, onSaved }: { draft: Draft; onClose: () => void; onSaved: () => void }) {
  const [d, setD] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function save(e: FormEvent) {
    e.preventDefault()
    if (d.to <= d.from) return setError('End time must be after the start time.')
    setBusy(true); setError('')
    try {
      await api('/api/schedule/blocks', { method: 'POST', body: { start: fromCalgaryInput(`${d.day}T${d.from}`).toISOString(), end: fromCalgaryInput(`${d.day}T${d.to}`).toISOString(), kind: d.kind, label: d.label.trim(), repeat_weekly: d.repeat } })
      onSaved()
    } catch (err) { setError((err as Error).message); setBusy(false) }
  }
  return <Modal title="Block time" onClose={onClose}>
    <form onSubmit={save} className="space-y-4">
      <div role="radiogroup" aria-label="Type" className="grid grid-cols-5 gap-1.5">
        {BLOCKABLE.map(k => { const Icon = KINDS[k].icon; const on = d.kind === k; return (
          <button key={k} type="button" role="radio" aria-checked={on} onClick={() => setD({ ...d, kind: k })}
            className={cx('flex flex-col items-center gap-1 rounded-xl border p-2 text-[11px] font-bold leading-tight', on ? 'border-brand bg-brand-tint text-brand-strong' : 'border-line text-muted hover:bg-surface-2')}>
            <Icon size={18} aria-hidden />{KINDS[k].label}
          </button>) })}
      </div>
      <Field label="Day" type="date" required value={d.day} onChange={e => setD({ ...d, day: e.target.value })} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="From" type="time" required step={900} value={d.from} onChange={e => setD({ ...d, from: e.target.value })} />
        <Field label="To" type="time" required step={900} value={d.to} onChange={e => setD({ ...d, to: e.target.value })} />
      </div>
      <Field label="Note (only you see this)" maxLength={80} value={d.label} onChange={e => setD({ ...d, label: e.target.value })} placeholder={d.kind === 'me_time' ? 'Rest, gym, nothing at all' : 'Optional'} />
      <Switch label="Every week" checked={d.repeat} onChange={repeat => setD({ ...d, repeat })} />
      {error && <Alert>{error}</Alert>}
      <div className="flex gap-2 border-t border-line pt-4"><Button type="submit" loading={busy}>Save</Button><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button></div>
    </form>
  </Modal>
}

function CalendarDialog({ settings, onClose, onChange }: { settings: ScheduleSettings; onClose: () => void; onChange: (s: ScheduleSettings) => void }) {
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')
  const file = useRef<HTMLInputElement>(null)
  const linked = settings.calendar
  async function run(fn: () => Promise<unknown>, message: string) {
    setBusy(true); setError(''); setDone('')
    try { await fn(); onChange(await api<ScheduleSettings>('/api/schedule/settings')); setDone(message); setUrl('') } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  async function upload(f: File) {
    const content = await f.text()
    await run(async () => { const r = await api<{ imported: number }>('/api/schedule/import', { method: 'POST', body: { content } }); setDone(`${r.imported} busy times imported`) }, '')
  }
  return <Modal title="Your calendar" onClose={onClose}>
    {linked ? <div className="rounded-xl border border-line p-4">
      <p className="flex items-center gap-2 font-bold"><CalendarCheck size={18} className="text-success" aria-hidden />{linked.provider} connected</p>
      <p className="mt-1 text-sm text-muted">{linked.busyCount} busy times{linked.lastSynced && ` · synced ${fmtCalgary(new Date(linked.lastSynced), { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`}</p>
      {linked.error && <p className="mt-2 text-sm text-danger">{linked.error}</p>}
      <div className="mt-3 flex gap-2">
        <Button variant="secondary" loading={busy} onClick={() => run(() => api('/api/schedule/calendar/sync', { method: 'POST' }), 'Synced')}><RefreshCw size={16} aria-hidden />Sync now</Button>
        <Button variant="ghost" disabled={busy} onClick={() => run(() => api('/api/schedule/calendar', { method: 'DELETE' }), 'Disconnected')}>Disconnect</Button>
      </div>
    </div> : <form onSubmit={e => { e.preventDefault(); void run(() => api('/api/schedule/calendar', { method: 'PUT', body: { url } }), 'Google Calendar connected') }} className="space-y-3">
      <ol className="space-y-2 text-sm">
        {[<>Open <a className="font-bold text-brand-strong" href="https://calendar.google.com/calendar/r/settings" target="_blank" rel="noreferrer">Google Calendar settings</a></>,
          <>Pick your calendar, then <b>Integrate calendar</b></>,
          <>Copy <b>Secret address in iCal format</b></>].map((step, i) => (
          <li key={i} className="flex items-start gap-3"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-tint text-xs font-extrabold text-brand-strong">{i + 1}</span><span className="pt-0.5">{step}</span></li>
        ))}
      </ol>
      <Field label="Secret iCal address" type="url" required value={url} onChange={e => setUrl(e.target.value)} placeholder="https://calendar.google.com/calendar/ical/…/basic.ics" />
      <Button type="submit" loading={busy} disabled={!url.trim()}>Connect</Button>
    </form>}
    <div className="mt-4 flex items-center gap-3 border-t border-line pt-4">
      <input ref={file} type="file" accept=".ics,text/calendar" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = '' }} />
      <Button variant="secondary" disabled={busy} onClick={() => file.current?.click()}><FileUp size={16} aria-hidden />Import .ics file</Button>
      <span className="text-xs text-muted">Outlook, Apple, Google</span>
    </div>
    <p className="mt-4 flex items-start gap-2 text-xs text-muted"><Lock size={14} className="mt-0.5 shrink-0" aria-hidden />We keep busy times only, never titles. Friends see when you're busy, not what.</p>
    <div role="status" className="mt-2 text-sm font-bold text-success">{done}</div>
    {error && <div className="mt-2"><Alert>{error}</Alert></div>}
  </Modal>
}
