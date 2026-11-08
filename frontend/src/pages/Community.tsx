// Community: browse interest groups, join one, then chat in its channels (Discord-style:
// communities rail on the left, channel list next to it, messages on the right).
// Memberships, member counts and messages come from the shared database, so everyone sees the same thing.
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft, BookOpen, Check, Coffee, Compass, Footprints, Hash, LogOut, Palette, Plus, Search, Send, Trash2, Users,
  type LucideIcon,
} from 'lucide-react'
import { Button, Card, cx, PageHeader } from '../components/ui'
import { api } from '../lib/api'
import { groups, interests, useCommunityGroups, type ChatMessage, type Group, type GroupState } from '../lib/community'
import { fmtCalgary, initials } from '../lib/nexus'

const GROUP_ICONS: Record<string, LucideIcon> = { walk: Footprints, books: BookOpen, art: Palette, coffee: Coffee }
const GroupIcon = ({ id, className }: { id: string; className?: string }) => {
  const Icon = GROUP_ICONS[id] ?? Users
  return <Icon className={className} aria-hidden />
}

const CHANNEL_TOPICS: Record<string, string> = {
  introductions: 'Say hello and share what brings you here. It’s okay to just read, too.',
  general: 'Anything goes. Questions, ideas and plans.',
  'weekend-walks': 'Plan this weekend’s walks and where to meet.',
  'what-we-are-reading': 'Share what you’re reading and what you thought of it.',
  'creative-corner': 'Show your work, find a sketch buddy, share gallery picks.',
  'coffee-plans': 'Pick a café and a time to meet up.',
}
const topicFor = (group: Group, channel: string) => CHANNEL_TOPICS[channel] ?? `Talk about ${group.interest.toLowerCase()}.`
const memberLabel = (n?: number) => n === undefined ? '…' : `${n} ${n === 1 ? 'member' : 'members'}`

export default function Community() {
  const { state, joined, error, setMembership } = useCommunityGroups()
  const [params, setParams] = useSearchParams()
  const selected = groups.find((g) => g.id === params.get('group'))
  const channel = selected && selected.channels.includes(params.get('channel') ?? '') ? params.get('channel')! : selected?.channels[0]

  const open = (id: string, ch?: string) => setParams(ch ? { group: id, channel: ch } : { group: id })
  const browse = () => setParams({})

  if (selected && channel) {
    return (
      <GroupSpace key={selected.id} group={selected} channel={channel} state={state} joined={joined}
        onOpen={open} onBrowse={browse} setMembership={setMembership} />
    )
  }
  return <Browse state={state} joined={joined} error={error} onOpen={open} setMembership={setMembership} />
}

type MembershipFn = (id: string, join: boolean) => Promise<void>

// ---------------- Browse communities ----------------

function Browse({ state, joined, error, onOpen, setMembership }: {
  state: Record<string, GroupState>; joined: string[]; error: string; onOpen: (id: string, ch?: string) => void; setMembership: MembershipFn
}) {
  const [query, setQuery] = useState('')
  const [interest, setInterest] = useState<string | null>(null)
  const [joining, setJoining] = useState<string | null>(null)
  const [joinError, setJoinError] = useState('')
  const usedInterests = interests.filter((i) => groups.some((g) => g.interest === i))
  const mine = groups.filter((g) => joined.includes(g.id))
  const q = query.trim().toLowerCase()
  const visible = groups.filter((g) => (!interest || g.interest === interest) && (!q || `${g.name} ${g.description} ${g.interest}`.toLowerCase().includes(q)))

  async function join(id: string) {
    setJoining(id); setJoinError('')
    try { await setMembership(id, true); onOpen(id, 'introductions') }
    catch (e) { setJoinError((e as Error).message); setJoining(null) }
  }

  return (
    <div className="space-y-8">
      <PageHeader title="Find your people" subtitle="Shared interests. Familiar faces. A place to belong." />

      {mine.length > 0 ? (
        <section aria-labelledby="your-communities">
          <h2 id="your-communities" className="mb-3 text-sm font-semibold text-muted">Your communities</h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {mine.map((g) => (
              <button key={g.id} type="button" onClick={() => onOpen(g.id)}
                className="discord discord-card flex items-center gap-3 rounded-2xl border border-line bg-grey-card p-4 text-left transition hover:bg-surface-2">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-surface-2 text-fg"><GroupIcon id={g.id} className="size-5" /></span>
                <span className="min-w-0">
                  <span className="block truncate font-extrabold">{g.name}</span>
                  <span className="block text-sm text-muted">{g.channels.length} channels · {memberLabel(state[g.id]?.members)}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : (
        <div className="rounded-2xl bg-brand-tint p-5 text-brand-strong">
          <p className="font-extrabold">A small hello can be a good beginning.</p>
          <p className="mt-1 text-sm">Explore a community that feels like you.</p>
        </div>
      )}

      <section aria-labelledby="discover" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="discover" className="text-xl font-extrabold">Discover communities</h2>
          <label className="relative block w-full sm:w-72">
            <span className="sr-only">Search communities</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search books, walking, coffee…"
              className="w-full rounded-full border border-line bg-surface py-2.5 pl-9 pr-4 outline-none focus:border-brand focus:ring-4 focus:ring-brand/15" />
          </label>
        </div>
        <div role="group" aria-label="Filter by interest" className="flex flex-wrap gap-2">
          {[null, ...usedInterests].map((i) => (
            <button key={i ?? 'all'} type="button" aria-pressed={interest === i} onClick={() => setInterest(i)}
              className={cx('rounded-full border px-3.5 py-1.5 text-sm font-bold transition',
                interest === i ? 'border-brand bg-brand-tint text-brand-strong' : 'border-line bg-surface text-muted hover:text-fg')}>
              {i ?? 'All'}
            </button>
          ))}
        </div>
        {(joinError || error) && <p role="alert" className="text-sm font-semibold text-danger">{joinError || `Couldn’t load communities: ${error}`}</p>}

        {visible.length === 0 ? (
          <Card>
            <h3 className="font-bold">No communities found</h3>
            <p className="my-3 text-muted">Try another search or look at all the groups.</p>
            <Button variant="secondary" onClick={() => { setQuery(''); setInterest(null) }}>Clear filters</Button>
          </Card>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            {visible.map((g) => {
              const isMember = joined.includes(g.id)
              return (
                <Card key={g.id} as="article" className="discord discord-card flex flex-col border-line! bg-grey-card! p-6! shadow-none!">
                  <div className="flex items-start gap-4">
                    <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-surface-2 text-fg"><GroupIcon id={g.id} className="size-6" /></span>
                    <div className="min-w-0">
                      <p className="text-sm text-muted">{g.interest}</p>
                      <h3 className="text-lg font-extrabold leading-snug">{g.name}</h3>
                    </div>
                  </div>
                  <p className="mt-3 flex-1 leading-relaxed text-muted">{g.description}</p>
                  <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
                    <span className="inline-flex items-center gap-1"><Users className="size-4" aria-hidden />{memberLabel(state[g.id]?.members)}</span>
                    <span>{g.vibe}</span>
                  </p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    {isMember ? (
                      <Button onClick={() => onOpen(g.id)}><Hash className="size-4" aria-hidden /> Open channels</Button>
                    ) : (
                      <>
                        <Button loading={joining === g.id} onClick={() => join(g.id)}><Plus className="size-4" aria-hidden /> Join</Button>
                        <Button variant="secondary" onClick={() => onOpen(g.id)}>Take a look</Button>
                      </>
                    )}
                    {isMember && <span className="inline-flex items-center gap-1 self-center text-sm font-bold text-brand-strong"><Check className="size-4" aria-hidden />Joined</span>}
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

// ---------------- Inside a community: rail + channels + chat ----------------

function GroupSpace({ group, channel, state, joined, onOpen, onBrowse, setMembership }: {
  group: Group; channel: string; state: Record<string, GroupState>; joined: string[]
  onOpen: (id: string, ch?: string) => void; onBrowse: () => void; setMembership: MembershipFn
}) {
  const isMember = joined.includes(group.id)
  const railGroups = groups.filter((g) => joined.includes(g.id) || g.id === group.id)
  const [membershipBusy, setMembershipBusy] = useState(false)
  const [notice, setNotice] = useState('')

  async function toggleMembership() {
    setMembershipBusy(true); setNotice('')
    try {
      await setMembership(group.id, !isMember)
      setNotice(isMember ? `You left ${group.name}.` : `Welcome to ${group.name}! Say hello in #introductions.`)
      if (!isMember) onOpen(group.id, 'introductions')
    } catch (e) { setNotice((e as Error).message) }
    finally { setMembershipBusy(false) }
  }

  return (
    <div className="space-y-3">
      <button type="button" onClick={onBrowse} className="inline-flex items-center gap-1.5 text-sm font-bold text-muted hover:text-fg">
        <ArrowLeft className="size-4" aria-hidden /> All communities
      </button>

      <div className="discord flex h-[calc(100dvh-12rem)] min-h-[520px] overflow-hidden rounded-2xl border border-line bg-chat-main">
        {/* Communities rail */}
        <nav aria-label="Your communities" className="hidden w-[76px] shrink-0 flex-col items-center gap-2 overflow-y-auto bg-chat-rail py-3 sm:flex">
          <RailButton label="Discover communities" onClick={onBrowse}><Compass className="size-5" aria-hidden /></RailButton>
          <span className="my-1 h-px w-8 bg-line" aria-hidden />
          {railGroups.map((g) => (
            <RailButton key={g.id} label={joined.includes(g.id) ? g.name : `${g.name} (not joined)`} active={g.id === group.id}
              muted={!joined.includes(g.id)} onClick={() => onOpen(g.id)}>
              <GroupIcon id={g.id} className="size-5" />
            </RailButton>
          ))}
        </nav>

        {/* Channel list */}
        <aside aria-label={`${group.name} channels`} className="hidden w-64 shrink-0 flex-col bg-chat-side md:flex">
          <div className="border-b border-black/25 p-4">
            <h1 className="text-lg font-extrabold leading-snug">{group.name}</h1>
            <p className="mt-0.5 flex items-center gap-1 text-sm text-muted"><Users className="size-3.5" aria-hidden />{memberLabel(state[group.id]?.members)}</p>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            <p className="mb-1.5 px-2 text-sm font-semibold text-muted">Text channels</p>
            <ul className="space-y-0.5">
              {group.channels.map((c) => (
                <li key={c}>
                  <button type="button" onClick={() => onOpen(group.id, c)} aria-current={c === channel ? 'page' : undefined}
                    className={cx('flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left font-bold transition',
                      c === channel ? 'bg-chat-active text-fg' : 'text-muted hover:bg-chat-active/50 hover:text-fg')}>
                    <Hash className="size-4 shrink-0" aria-hidden /><span className="truncate">{c}</span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-5 px-2 text-xs leading-relaxed text-muted">Be kind, respect boundaries, and keep personal contact details private.</p>
          </div>
          <div className="border-t border-black/25 p-3">
            {isMember
              ? <Button variant="ghost" className="w-full justify-center text-sm" loading={membershipBusy} onClick={toggleMembership}><LogOut className="size-4" aria-hidden /> Leave community</Button>
              : <Button className="w-full justify-center" loading={membershipBusy} onClick={toggleMembership}><Plus className="size-4" aria-hidden /> Join community</Button>}
          </div>
        </aside>

        <Channel key={channel} group={group} channel={channel} isMember={isMember} onOpen={onOpen}
          onToggleMembership={toggleMembership} membershipBusy={membershipBusy} notice={notice} />
      </div>
    </div>
  )
}

function RailButton({ label, active, muted, onClick, children }: { label: string; active?: boolean; muted?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} title={label} aria-label={label} aria-current={active ? 'page' : undefined}
      className={cx('relative grid size-12 place-items-center transition-all',
        active ? 'rounded-xl bg-brand text-on-brand' : 'rounded-full bg-chat-main text-muted hover:rounded-xl hover:bg-brand hover:text-on-brand',
        muted && !active && 'opacity-60')}>
      {active && <span className="absolute -left-3 h-8 w-1 rounded-r-full bg-fg" aria-hidden />}
      {children}
    </button>
  )
}

function Channel({ group, channel, isMember, onOpen, onToggleMembership, membershipBusy, notice }: {
  group: Group; channel: string; isMember: boolean; onOpen: (id: string, ch?: string) => void; onToggleMembership: () => void; membershipBusy: boolean; notice: string
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const scroller = useRef<HTMLDivElement>(null)
  const url = `/api/community/groups/${group.id}/channels/${channel}/messages`

  // Load the channel, then check for new messages every 15 s while it's open.
  useEffect(() => {
    let active = true
    const load = () => api<ChatMessage[]>(url)
      .then((m) => { if (active) { setMessages(m); setError('') } })
      .catch((e) => { if (active) setError(e.message) })
      .finally(() => { if (active) setLoading(false) })
    load()
    const timer = setInterval(load, 15_000)
    return () => { active = false; clearInterval(timer) }
  }, [url, refresh])

  // Keep the newest message in view.
  useEffect(() => {
    const el = scroller.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length, loading])

  async function send(e?: FormEvent) {
    e?.preventDefault()
    if (!isMember || !text.trim() || sending) return
    setSending(true); setSendError('')
    try {
      const m = await api<ChatMessage>(url, { method: 'POST', body: { text: text.trim() } })
      setMessages((prev) => [...prev, m]); setText('')
    } catch (err) { setSendError((err as Error).message) }
    finally { setSending(false) }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send() }
  }

  async function remove(id: number) {
    try { await api(`/api/community/messages/${id}`, { method: 'DELETE' }); setMessages((prev) => prev.filter((m) => m.id !== id)) }
    catch (err) { setSendError((err as Error).message) }
  }

  return (
    <section aria-label={`#${channel}`} className="flex min-w-0 flex-1 flex-col">
      {/* Channel header */}
      <header className="border-b border-black/25 px-4 py-3">
        {/* Small screens: community name + leave, since the sidebar is hidden */}
        <div className="mb-2 flex items-center justify-between gap-2 md:hidden">
          <p className="truncate font-extrabold">{group.name}</p>
          {isMember && <Button variant="ghost" className="shrink-0 px-2 py-1 text-sm" loading={membershipBusy} onClick={onToggleMembership}><LogOut className="size-4" aria-hidden /> Leave</Button>}
        </div>
        <div className="flex items-center gap-2">
          <Hash className="size-5 shrink-0 text-muted" aria-hidden />
          <h2 className="truncate font-extrabold">{channel}</h2>
          <span className="hidden truncate border-l border-line pl-3 text-sm text-muted lg:inline">{topicFor(group, channel)}</span>
        </div>
        {/* On small screens the channel list sits here instead of the sidebar */}
        <div className="-mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1 pb-1 md:hidden" role="group" aria-label="Channels">
          {group.channels.map((c) => (
            <button key={c} type="button" onClick={() => onOpen(group.id, c)} aria-current={c === channel ? 'page' : undefined}
              className={cx('inline-flex shrink-0 items-center gap-1 rounded-full border px-3 py-1 text-sm font-bold',
                c === channel ? 'border-brand bg-brand-tint text-brand-strong' : 'border-line text-muted')}>
              <Hash className="size-3.5" aria-hidden />{c}
            </button>
          ))}
        </div>
      </header>

      {/* Messages */}
      <div ref={scroller} className="flex-1 overflow-y-auto px-4 py-4" aria-live="polite" aria-busy={loading}>
        <div className="mb-5 border-b border-line pb-5">
          <span className="grid size-14 place-items-center rounded-full bg-chat-input text-fg"><Hash className="size-7" aria-hidden /></span>
          <p className="mt-3 text-2xl font-extrabold">Welcome to #{channel}</p>
          <p className="mt-1 text-muted">{topicFor(group, channel)}</p>
        </div>
        {loading ? <p className="text-sm text-muted">Loading messages…</p>
          : messages.length === 0 && !error ? <p className="text-sm text-muted">No messages yet. {isMember ? 'Be the first to say hello!' : 'Join to start the conversation.'}</p>
          : (
            <ul className="-mx-4">
              {messages.map((m) => (
                <li key={m.id} className="group flex gap-3 px-4 py-2 hover:bg-chat-hover">
                  <span className={cx('grid size-10 shrink-0 place-items-center rounded-full text-sm font-extrabold', m.mine ? 'bg-brand text-on-brand' : 'bg-pink text-navy')} aria-hidden>
                    {initials(m.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-baseline gap-x-2">
                      {m.mine ? <strong>{m.name} <span className="font-normal text-muted">(you)</span></strong>
                        : <Link to={`/people/${m.user_id}`} className="font-bold hover:text-brand-strong hover:underline">{m.name}</Link>}
                      <time className="text-xs text-muted" dateTime={m.time}>{fmtCalgary(new Date(m.time), { dateStyle: 'medium', timeStyle: 'short' })}</time>
                    </p>
                    <p className="whitespace-pre-wrap break-words leading-relaxed">{m.text}</p>
                  </div>
                  {m.mine && (
                    <button type="button" onClick={() => remove(m.id)} aria-label="Delete your message" title="Delete"
                      className="grid size-8 shrink-0 place-items-center self-start rounded-lg text-muted opacity-0 transition hover:bg-chat-input hover:text-danger focus:opacity-100 group-hover:opacity-100">
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        {error && <p className="mt-3 text-sm text-danger" role="alert">{error} <button type="button" className="font-bold underline" onClick={() => setRefresh((v) => v + 1)}>Retry</button></p>}
      </div>

      {/* Composer, or a join prompt when previewing */}
      <div className="px-4 pb-3 pt-1">
        {isMember ? (
          <form onSubmit={send}>
            <label htmlFor="channel-message" className="sr-only">Message #{channel}</label>
            <div className="flex items-end gap-2 rounded-xl bg-chat-input p-1.5 focus-within:ring-2 focus-within:ring-brand-edge">
              <textarea id="channel-message" rows={1} value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} onKeyDown={onKeyDown}
                placeholder={`Message #${channel}`}
                className="max-h-40 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 outline-none placeholder:text-muted/80" />
              <Button type="submit" className="size-10 shrink-0 justify-center p-0" loading={sending} disabled={!text.trim()} aria-label="Send message">
                {!sending && <Send className="size-4" aria-hidden />}
              </Button>
            </div>
            <p className="mt-1.5 flex justify-between gap-2 px-1 text-xs text-muted">
              <span>Enter to send · Shift + Enter for a new line</span>
              {text.length > 800 && <span>{text.length}/1000</span>}
            </p>
          </form>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-chat-input px-4 py-3">
            <p className="text-sm font-bold">You’re taking a look. Join {group.name} to post in its channels.</p>
            <Button loading={membershipBusy} onClick={onToggleMembership}><Plus className="size-4" aria-hidden /> Join community</Button>
          </div>
        )}
        <p role="status" className="px-1 text-sm">
          {sendError && <span className="text-danger">{sendError}</span>}
          {!sendError && notice && <span className="text-muted">{notice}</span>}
        </p>
      </div>
    </section>
  )
}
