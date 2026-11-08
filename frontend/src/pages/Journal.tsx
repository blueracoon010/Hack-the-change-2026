// Journal: positive-affirmation flashcards (public affirmations.dev API, via our backend) and private notes
// with a mood, Notion-style: a list of pages on the left, a quiet editor on the right that saves as you type.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  BatteryLow, Check, ChevronLeft, ChevronRight, CloudRain, Heart, Meh, PenLine, Plus, Shuffle, Smile, Sun, Trash2, Wind, Zap,
  type LucideIcon,
} from 'lucide-react'
import { Button, cx, PageHeader } from '../components/ui'
import { api } from '../lib/api'
import { fmtCalgary } from '../lib/nexus'

type Mood = 'great' | 'good' | 'okay' | 'low' | 'stressed' | 'anxious' | 'grateful' | 'tired'
type Entry = { id: number; title: string; body: string; mood: Mood | null; createdAt: string; updatedAt: string }

const MOODS: { id: Mood; label: string; icon: LucideIcon }[] = [
  { id: 'great', label: 'Great', icon: Sun },
  { id: 'good', label: 'Good', icon: Smile },
  { id: 'okay', label: 'Okay', icon: Meh },
  { id: 'grateful', label: 'Grateful', icon: Heart },
  { id: 'tired', label: 'Tired', icon: BatteryLow },
  { id: 'low', label: 'Low', icon: CloudRain },
  { id: 'stressed', label: 'Stressed', icon: Zap },
  { id: 'anxious', label: 'Anxious', icon: Wind },
]
const moodOf = (id: Mood | null) => MOODS.find((m) => m.id === id)

export default function Journal() {
  return (
    <div className="space-y-8">
      <PageHeader title="Check in with" accent="yourself" subtitle="Notes, moods and a kind word for today. Only you can see this." />
      <Affirmations />
      <Notes />
    </div>
  )
}

// ---------------- Affirmation flashcards ----------------

type Theme = 'all' | 'happiness' | 'belonging'
type Card = { text: string; theme: 'happiness' | 'belonging' }

function Affirmations() {
  const [deck, setDeck] = useState<Card[]>([])
  const [theme, setTheme] = useState<Theme>('all')
  const [i, setI] = useState(0)
  const [loading, setLoading] = useState(true)
  const load = useCallback(() => {
    setLoading(true)
    api<{ deck: Card[] }>(`/api/wellbeing/affirmations?count=12${theme === 'all' ? '' : `&theme=${theme}`}`)
      .then((d) => { setDeck(d.deck); setI(0) })
      .catch(() => setDeck([{ text: 'I belong here, just as I am.', theme: 'belonging' }]))
      .finally(() => setLoading(false))
  }, [theme])
  useEffect(load, [load])
  const cards = deck.map((c) => c.text)

  const go = (d: number) => setI((v) => (v + d + cards.length) % cards.length)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, textarea')) return
      if (e.key === 'ArrowRight') go(1)
      if (e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <section aria-label="Affirmations">
      <div className="card-pop card-yellow relative overflow-hidden rounded-3xl px-6 py-10 sm:px-14">
        <div className="flex flex-wrap items-center justify-center gap-1.5" role="group" aria-label="Affirmation theme">
          {(['all', 'happiness', 'belonging'] as Theme[]).map((t) => (
            <button key={t} type="button" aria-pressed={theme === t} onClick={() => setTheme(t)}
              className="theme-chip rounded-full px-3 py-1 text-xs font-semibold capitalize transition">
              {t === 'all' ? 'All' : t}
            </button>
          ))}
        </div>
        <p className="mt-4 text-center text-xs font-medium uppercase tracking-wider text-fg/60">{deck[i] ? (deck[i].theme === 'happiness' ? 'Happiness' : 'Belonging') : 'Today’s affirmation'}</p>
        <p key={i} aria-live="polite" className="affirm-in font-display mx-auto mt-4 min-h-[4.5rem] max-w-2xl text-balance text-center text-[1.75rem] leading-snug sm:text-[2.1rem]">
          {loading ? '…' : cards[i]}
        </p>
        <div className="mt-6 flex items-center justify-center gap-2">
          <button type="button" onClick={() => go(-1)} aria-label="Previous affirmation" className="grid size-9 place-items-center rounded-full bg-white/70 hover:bg-white"><ChevronLeft className="size-5" aria-hidden /></button>
          <span className="w-14 text-center text-sm tabular-nums text-fg/60">{cards.length ? `${i + 1} / ${cards.length}` : ''}</span>
          <button type="button" onClick={() => go(1)} aria-label="Next affirmation" className="grid size-9 place-items-center rounded-full bg-white/70 hover:bg-white"><ChevronRight className="size-5" aria-hidden /></button>
          <button type="button" onClick={load} aria-label="New deck" title="New deck" className="ml-2 grid size-9 place-items-center rounded-full bg-white/70 hover:bg-white"><Shuffle className="size-4" aria-hidden /></button>
        </div>
      </div>
    </section>
  )
}

// ---------------- Notes ----------------

function Notes() {
  const [entries, setEntries] = useState<Entry[] | null>(null)
  const [selected, setSelected] = useState<number | null>(null) // null = a fresh blank entry
  const [editorKey, setEditorKey] = useState(0) // new key = new editor; kept when a draft gets saved for the first time
  const [error, setError] = useState('')
  useEffect(() => {
    api<Entry[]>('/api/wellbeing/journal').then(setEntries).catch((e) => setError((e as Error).message))
  }, [])

  const openEntry = (id: number | null) => { setSelected(id); setEditorKey((k) => k + 1) }
  const created = (e: Entry) => { setEntries((prev) => [e, ...(prev ?? [])]); setSelected(e.id) }
  const replace = (e: Entry) => setEntries((prev) => (prev ?? []).map((x) => (x.id === e.id ? e : x)))
  const deleted = (id: number) => { setEntries((prev) => (prev ?? []).filter((e) => e.id !== id)); openEntry(null) }
  const open = selected === null ? null : entries?.find((e) => e.id === selected) ?? null

  return (
    <section aria-labelledby="notes-title">
      <div className="mb-3 flex items-center justify-between">
        <h2 id="notes-title" className="text-lg font-semibold">Your notes</h2>
        <Button onClick={() => openEntry(null)} className="h-9 px-3"><Plus className="size-4" aria-hidden /> New entry</Button>
      </div>
      {error && <p role="alert" className="mb-3 text-sm text-danger">{error}</p>}
      <div className="grid min-h-[480px] overflow-hidden rounded-2xl border border-line bg-surface md:grid-cols-[260px_1fr]">
        <nav aria-label="Journal entries" className="border-b border-line bg-surface-2 p-2 md:border-b-0 md:border-r">
          {entries === null ? <p className="p-3 text-sm text-muted">Loading…</p>
            : entries.length === 0 ? <p className="p-3 text-sm text-muted">No entries yet. Start writing on the right.</p>
            : (
              <ul className="max-h-60 space-y-0.5 overflow-y-auto md:max-h-[560px]">
                {entries.map((e) => {
                  const M = moodOf(e.mood)?.icon ?? PenLine
                  return (
                    <li key={e.id}>
                      <button type="button" onClick={() => openEntry(e.id)} aria-current={e.id === selected ? 'page' : undefined}
                        className={cx('flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition', e.id === selected ? 'bg-surface shadow-sm ring-1 ring-line' : 'hover:bg-surface/70')}>
                        <M className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{e.title || firstLine(e.body) || 'Untitled'}</span>
                          <span className="block text-xs text-muted">{fmtCalgary(new Date(e.createdAt), { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
        </nav>
        <Editor key={editorKey} entry={open} onCreated={created} onSaved={replace} onDeleted={deleted} onDone={() => openEntry(null)} />
      </div>
      <p className="mt-2 text-xs text-muted">Only you can see your journal.</p>
    </section>
  )
}

const firstLine = (s: string) => s.split('\n').find((l) => l.trim())?.trim().slice(0, 60) ?? ''

/** One journal page. With no entry it's a blank new page that is saved (created) on the first words you write. */
function Editor({ entry, onCreated, onSaved, onDeleted, onDone }: {
  entry: Entry | null; onCreated: (e: Entry) => void; onSaved: (e: Entry) => void; onDeleted: (id: number) => void; onDone: () => void
}) {
  const [id, setId] = useState<number | null>(entry?.id ?? null)
  const [createdAt, setCreatedAt] = useState(entry?.createdAt ?? null)
  const [title, setTitle] = useState(entry?.title ?? '')
  const [body, setBody] = useState(entry?.body ?? '')
  const [mood, setMood] = useState<Mood | null>(entry?.mood ?? null)
  const [status, setStatus] = useState<'idle' | 'saved' | 'saving' | 'error'>(entry ? 'saved' : 'idle')
  const [confirming, setConfirming] = useState(false)
  const first = useRef(true)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saving = useRef<Promise<void> | null>(null)
  const idRef = useRef(id)
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  const draft = useMemo(() => ({ title, body, mood }), [title, body, mood])
  const empty = !title.trim() && !body.trim() && !mood

  // Write the page: create it the first time, update it after that. Calls are chained so they never race.
  function save(): Promise<void> {
    const run = async () => {
      if (idRef.current === null) {
        if (empty) { setStatus('idle'); return }
        const e = await api<Entry>('/api/wellbeing/journal', { method: 'POST', body: draft })
        idRef.current = e.id; setId(e.id); setCreatedAt(e.createdAt); onCreated(e)
      } else {
        onSaved(await api<Entry>(`/api/wellbeing/journal/${idRef.current}`, { method: 'PUT', body: draft }))
      }
      setStatus('saved')
    }
    saving.current = (saving.current ?? Promise.resolve()).then(run).catch(() => setStatus('error'))
    return saving.current
  }

  // Save 700 ms after typing stops.
  useEffect(() => {
    if (first.current) { first.current = false; return }
    setStatus('saving')
    timer.current = setTimeout(() => { timer.current = null; void save() }, 700)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [draft]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (!entry) titleRef.current?.focus() }, [entry])

  // Grow the text area with its content, like a page.
  useEffect(() => {
    const el = bodyRef.current
    if (el) { el.style.height = 'auto'; el.style.height = `${Math.max(el.scrollHeight, 260)}px` }
  }, [body])

  async function done() {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; await save() }
    else if (saving.current) await saving.current
    onDone()
  }
  async function remove() {
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
    if (saving.current) await saving.current
    if (idRef.current === null) { onDone(); return }
    try { await api(`/api/wellbeing/journal/${idRef.current}`, { method: 'DELETE' }); onDeleted(idRef.current) }
    catch { setStatus('error'); setConfirming(false) }
  }

  return (
    <article className="flex min-w-0 flex-col px-6 py-6 sm:px-10">
      <div className="flex min-h-8 flex-wrap items-center justify-between gap-3 text-xs text-muted">
        <span>{createdAt ? fmtCalgary(new Date(createdAt), { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'New entry · saved as you type'}</span>
        {confirming ? (
          <span className="flex items-center gap-2" role="alert">
            <span className="font-medium text-fg">{id === null ? 'Discard this page?' : 'Delete this entry? This can’t be undone.'}</span>
            <Button variant="danger" className="h-8 px-3 text-xs" onClick={remove}>{id === null ? 'Discard' : 'Delete'}</Button>
            <Button variant="ghost" className="h-8 px-3 text-xs" onClick={() => setConfirming(false)}>Cancel</Button>
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <span aria-live="polite">{status === 'saving' ? 'Saving…' : status === 'error' ? <span className="text-danger">Not saved</span> : status === 'saved' ? 'Saved' : ''}</span>
            {!empty && <Button variant="secondary" className="h-8 px-3 text-xs" onClick={done}><Check className="size-3.5" aria-hidden />Done</Button>}
            {(id !== null || !empty) && <button type="button" onClick={() => setConfirming(true)} aria-label={id === null ? 'Discard this page' : 'Delete entry'} title={id === null ? 'Discard' : 'Delete entry'}
              className="grid size-8 place-items-center rounded-lg hover:bg-surface-2 hover:text-danger"><Trash2 className="size-4" aria-hidden /></button>}
          </span>
        )}
      </div>
      <label className="sr-only" htmlFor="journal-title">Title</label>
      <input id="journal-title" ref={titleRef} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="Untitled"
        className="mt-3 w-full bg-transparent text-3xl font-semibold tracking-tight outline-none placeholder:text-fg/25" />
      <div role="group" aria-label="Mood" className="mt-4 flex flex-wrap gap-1.5">
        {MOODS.map((m) => {
          const on = mood === m.id
          return (
            <button key={m.id} type="button" aria-pressed={on} onClick={() => setMood(on ? null : m.id)}
              className={cx('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[13px] font-medium transition',
                on ? 'border-[var(--edge)] bg-fg text-bg' : 'border-[var(--edge)] text-fg hover:border-fg/30 hover:text-fg')}>
              <m.icon className="size-3.5" aria-hidden />{m.label}
            </button>
          )
        })}
      </div>
      <label className="sr-only" htmlFor="journal-body">Entry</label>
      <textarea id="journal-body" ref={bodyRef} value={body} onChange={(e) => setBody(e.target.value)} maxLength={20000}
        placeholder="How are you feeling right now? Write freely, nobody else will see this."
        className="mt-5 w-full flex-1 resize-none bg-transparent text-[15px] leading-7 outline-none placeholder:text-fg/30" />
    </article>
  )
}
