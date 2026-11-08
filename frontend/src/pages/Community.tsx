// Community: browse interest groups (built-in and ones people create), join one, then chat in its channels
// (Discord-style: rail on the left, channel list next to it, messages on the right). Friends can also message
// each other directly. Everything comes from the shared database, so everyone sees the same thing.
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft, Check, Compass, Globe2, Hash, Lock, LogOut, MessageCircle, Plus, Search, Send, Trash2, UserPlus, Users,
} from 'lucide-react'
import { GROUP_ICONS, GroupIcon } from '../components/GroupIcon'
import { Button, Card, cx, Field, Modal, PageHeader } from '../components/ui'
import { useApi } from '../hooks/useApi'
import { api } from '../lib/api'
import { interests, useCommunityGroups, type ChatMessage, type Group, type GroupState, type Relation } from '../lib/community'
import { fmtCalgary, initials } from '../lib/nexus'
import { popDot } from '../lib/pop'
import { UserAvatar } from '../components/UserAvatar'
import { useAuth } from '../context/AuthContext'

const CHANNEL_TOPICS: Record<string, string> = {
  introductions: 'Say hello and share what brings you here. It’s okay to just read, too.',
  general: 'Anything goes. Questions, ideas and plans.',
  'weekend-walks': 'Plan this weekend’s walks and where to meet.',
  'what-we-are-reading': 'Share what you’re reading and what you thought of it.',
  'creative-corner': 'Show your work, find a sketch buddy, share gallery picks.',
  'coffee-plans': 'Pick a café and a time to meet up.',
}
const topicFor = (group: Group, channel: string) => CHANNEL_TOPICS[channel] ?? (group.interest ? `Talk about ${group.interest.toLowerCase()}.` : `Welcome to ${group.name}.`)
const POP = ['card-red', 'card-green', 'card-yellow']
const popFor = (i: number) => `card-pop ${POP[i % POP.length]}`
const memberLabel = (n?: number) => n === undefined ? '…' : `${n} ${n === 1 ? 'member' : 'members'}`

type Conversation = { id: number; name: string; friend: boolean; unread: number; last: { text: string; time: string; mine: boolean } | null }
type MembershipFn = (id: string, join: boolean) => Promise<void>

export default function Community() {
  const { state, joined, all, error, setMembership, reload } = useCommunityGroups()
  const [params, setParams] = useSearchParams()
  const selected = all.find((g) => g.id === params.get('group'))
  const channel = selected && selected.channels.includes(params.get('channel') ?? '') ? params.get('channel')! : selected?.channels[0]
  const dm = params.get('dm')
  const { data: unreadData, reload: reloadUnread } = useApi<{ unread: number }>('/api/dm/unread', { refreshMs: 30_000 })
  const unread = unreadData?.unread ?? 0

  const open = (id: string, ch?: string) => setParams(ch ? { group: id, channel: ch } : { group: id })
  const openDm = (id?: number) => setParams({ dm: id ? String(id) : '' })
  const browse = () => setParams({})

  if (dm !== null) {
    return (
      <Shell all={all} joined={joined} active="dm" onBrowse={browse} onOpen={open} onDm={() => openDm()} unread={unread}>
        <DirectMessages personId={dm ? Number(dm) : null} onPick={openDm} onRead={reloadUnread} />
      </Shell>
    )
  }
  if (selected && channel) {
    return (
      <Shell all={all} joined={joined} active={selected.id} onBrowse={browse} onOpen={open} onDm={() => openDm()} unread={unread}>
        <GroupSpace key={selected.id} group={selected} channel={channel} state={state} joined={joined}
          onOpen={open} onDm={openDm} setMembership={setMembership} onDeleted={() => { void reload(); browse() }} />
      </Shell>
    )
  }
  return <Browse all={all} state={state} joined={joined} error={error} unread={unread} onOpen={open} onDm={() => openDm()}
    setMembership={setMembership} onCreated={async (id) => { await reload(); open(id) }} />
}

// ---------------- Browse communities ----------------

function Browse({ all, state, joined, error, unread, onOpen, onDm, setMembership, onCreated }: {
  all: Group[]; state: Record<string, GroupState>; joined: string[]; error: string; unread: number
  onOpen: (id: string, ch?: string) => void; onDm: () => void; setMembership: MembershipFn; onCreated: (id: string) => Promise<void>
}) {
  const [query, setQuery] = useState('')
  const [interest, setInterest] = useState<string | null>(null)
  const [joining, setJoining] = useState<string | null>(null)
  const [joinError, setJoinError] = useState('')
  const [creating, setCreating] = useState(false)
  const usedInterests = interests.filter((i) => all.some((g) => g.interest === i))
  const mine = all.filter((g) => joined.includes(g.id))
  const q = query.trim().toLowerCase()
  const visible = all.filter((g) => (!interest || g.interest === interest) && (!q || `${g.name} ${g.description} ${g.interest}`.toLowerCase().includes(q)))

  async function join(id: string) {
    setJoining(id); setJoinError('')
    try { await setMembership(id, true); onOpen(id) }
    catch (e) { setJoinError((e as Error).message); setJoining(null) }
  }

  return (
    <div className="space-y-8">
      <PageHeader title="Find your" accent="people" subtitle="Shared interests, familiar faces, and a place to belong."
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onDm}>
              <MessageCircle className="size-4" aria-hidden /> Messages
              {unread > 0 && <span className="ml-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-mustard px-1.5 text-xs font-semibold text-navy" aria-label={`${unread} unread`}>{unread}</span>}
            </Button>
            <Button onClick={() => setCreating(true)}><Plus className="size-4" aria-hidden /> Create community</Button>
          </div>
        } />

      {mine.length > 0 && (
        <section aria-labelledby="your-communities">
          <h2 id="your-communities" className="mb-3 text-sm font-semibold text-muted">Your communities</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {mine.map((g, i) => (
              <button key={g.id} type="button" onClick={() => onOpen(g.id)} className={`community-card ${popFor(i)} flex items-center gap-3 p-3.5 text-left`}>
                <span className="grid size-10 shrink-0 place-items-center rounded-xl icon-tile"><GroupIcon icon={g.icon} className="size-5" /></span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 font-semibold"><span className="truncate">{g.name}</span>{g.visibility === 'private' && <Lock className="size-3.5 shrink-0 text-muted" aria-label="Friends only" />}</span>
                  <span className="block text-sm text-muted">{memberLabel(state[g.id]?.members)}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="discover" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="discover" className="text-lg font-semibold">Discover communities</h2>
          <label className="relative block w-full sm:w-72">
            <span className="sr-only">Search communities</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search communities"
              className="h-10 w-full rounded-xl border border-line bg-surface pl-9 pr-4 outline-none focus:border-brand-edge focus:ring-4 focus:ring-brand/30" />
          </label>
        </div>
        <div role="group" aria-label="Filter by interest" className="flex flex-wrap gap-2">
          {[null, ...usedInterests].map((i) => (
            <button key={i ?? 'all'} type="button" aria-pressed={interest === i} onClick={() => setInterest(i)}
              className={cx('rounded-full border px-3 py-1.5 text-sm font-medium transition',
                interest === i ? 'border-[var(--edge)] bg-fg text-bg' : 'border-[var(--edge)] bg-surface text-fg hover:text-fg')}>
              {i ?? 'All'}
            </button>
          ))}
        </div>
        {(joinError || error) && <p role="alert" className="text-sm font-semibold text-danger">{joinError || `Couldn’t load communities: ${error}`}</p>}

        {visible.length === 0 ? (
          <Card>
            <h3 className="font-semibold">No communities found</h3>
            <p className="my-3 text-muted">Try another search, or start one yourself.</p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => { setQuery(''); setInterest(null) }}>Clear filters</Button>
              <Button onClick={() => setCreating(true)}><Plus className="size-4" aria-hidden /> Create community</Button>
            </div>
          </Card>
        ) : (
          <div className="grid gap-5 md:grid-cols-2">
            {visible.map((g, i) => {
              const isMember = joined.includes(g.id)
              return (
                <article key={g.id} className={`community-card ${popFor(i)} flex flex-col p-6`}>
                  <div className="flex items-start gap-4">
                    <span className="grid size-12 shrink-0 place-items-center rounded-2xl icon-tile"><GroupIcon icon={g.icon} className="size-6" /></span>
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 text-sm text-muted">
                        {g.visibility === 'private' ? <><Lock className="size-3.5" aria-hidden /> Friends only</> : g.interest || 'Community'}
                      </p>
                      <h3 className="text-lg font-semibold leading-snug">{g.name}</h3>
                    </div>
                  </div>
                  <p className="mt-3 flex-1 leading-relaxed text-muted">{g.description || 'A new community. Come say hello.'}</p>
                  <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
                    <span className="inline-flex items-center gap-1"><Users className="size-4" aria-hidden />{memberLabel(state[g.id]?.members)}</span>
                    {g.vibe && <span>{g.vibe}</span>}
                    {g.custom && g.owner && <span>{g.mine ? 'Started by you' : `Started by ${g.owner.split(' ')[0]}`}</span>}
                  </p>
                  <div className="mt-5 flex flex-wrap items-center gap-2">
                    {isMember ? (
                      <>
                        <Button onClick={() => onOpen(g.id)}><Hash className="size-4" aria-hidden /> Open channels</Button>
                        <span className="inline-flex items-center gap-1 text-sm font-medium text-brand-strong"><Check className="size-4" aria-hidden />Joined</span>
                      </>
                    ) : (
                      <>
                        <Button loading={joining === g.id} onClick={() => join(g.id)}><Plus className="size-4" aria-hidden /> Join</Button>
                        <Button variant="secondary" onClick={() => onOpen(g.id)}>Take a look</Button>
                      </>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>
      {creating && <CreateCommunity onClose={() => setCreating(false)} onCreated={async (id) => { setCreating(false); await onCreated(id) }} />}
    </div>
  )
}

// ---------------- Create a community ----------------

function CreateCommunity({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => Promise<void> }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [interest, setInterest] = useState('')
  const [icon, setIcon] = useState('users')
  const [visibility, setVisibility] = useState<'public' | 'private'>('public')
  const [channels, setChannels] = useState('introductions, general')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (name.trim().length < 3) return setError('Give your community a name (3+ letters).')
    setBusy(true); setError('')
    try {
      const g = await api<{ id: string }>('/api/community/groups', {
        method: 'POST',
        body: { name, description, interest, icon, visibility, channels: channels.split(',').map((c) => c.trim()).filter(Boolean) },
      })
      await onCreated(g.id)
    } catch (err) { setError((err as Error).message); setBusy(false) }
  }

  return (
    <Modal title="Create a community" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Sunday Morning Runners" required />
        <label className="block text-sm font-medium">Description <span className="font-normal text-muted">· optional</span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} rows={2} placeholder="What’s it about? Who’s it for?"
            className="mt-1.5 block w-full rounded-xl border border-line bg-surface p-3 font-normal outline-none focus:border-brand-edge focus:ring-4 focus:ring-brand/30" />
        </label>

        <fieldset>
          <legend className="mb-2 text-sm font-medium">Who can find it?</legend>
          <div className="grid grid-cols-2 gap-2">
            {([['public', Globe2, 'Public', 'Anyone can join'], ['private', Lock, 'Friends only', 'Only your friends']] as const).map(([v, Icon, label, hint]) => (
              <button key={v} type="button" aria-pressed={visibility === v} onClick={() => setVisibility(v)}
                className={cx('flex items-start gap-2.5 rounded-xl border p-3 text-left transition',
                  visibility === v ? 'border-[var(--edge)] bg-surface-2' : 'border-line hover:bg-surface-2')}>
                <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span><span className="block text-sm font-semibold">{label}</span><span className="block text-xs text-muted">{hint}</span></span>
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-sm font-medium">Icon</legend>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(GROUP_ICONS).map(([key, Icon]) => (
              <button key={key} type="button" aria-pressed={icon === key} aria-label={key} onClick={() => setIcon(key)}
                className={cx('grid size-9 place-items-center rounded-lg border transition', icon === key ? 'border-[var(--edge)] bg-surface-2' : 'border-[var(--edge)] text-fg hover:text-fg')}>
                <Icon className="size-4" aria-hidden />
              </button>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium">Interest
            <select value={interest} onChange={(e) => setInterest(e.target.value)} className="mt-1.5 block h-11 w-full rounded-xl border border-line bg-surface px-3 font-normal">
              <option value="">None</option>
              {interests.map((i) => <option key={i}>{i}</option>)}
            </select>
          </label>
          <Field label="Channels" hint="Separate with commas" value={channels} onChange={(e) => setChannels(e.target.value)} maxLength={200} />
        </div>

        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={busy}>Create</Button>
        </div>
      </form>
    </Modal>
  )
}

// ---------------- Shared Discord-style shell: rail on the left ----------------

function Shell({ all, joined, active, onBrowse, onOpen, onDm, unread, children }: {
  all: Group[]; joined: string[]; active: string; onBrowse: () => void; onOpen: (id: string) => void; onDm: () => void; unread: number; children: ReactNode
}) {
  const railGroups = all.filter((g) => joined.includes(g.id) || g.id === active)
  return (
    <div className="space-y-3">
      <button type="button" onClick={onBrowse} className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-fg">
        <ArrowLeft className="size-4" aria-hidden /> All communities
      </button>
      <div className="discord flex h-[calc(100dvh-12rem)] min-h-[520px] overflow-hidden rounded-2xl bg-chat-main">
        <nav aria-label="Your communities" className="hidden w-[76px] shrink-0 flex-col items-center gap-2 overflow-y-auto bg-chat-rail py-3 sm:flex">
          <RailButton label={unread ? `Direct messages (${unread} unread)` : 'Direct messages'} active={active === 'dm'} onClick={onDm} badge={unread}>
            <MessageCircle className="size-5" aria-hidden />
          </RailButton>
          <RailButton label="Discover communities" onClick={onBrowse}><Compass className="size-5" aria-hidden /></RailButton>
          <span className="my-1 h-px w-8 bg-line" aria-hidden />
          {railGroups.map((g) => (
            <RailButton key={g.id} label={joined.includes(g.id) ? g.name : `${g.name} (not joined)`} active={g.id === active}
              muted={!joined.includes(g.id)} onClick={() => onOpen(g.id)}>
              <GroupIcon icon={g.icon} className="size-5" />
            </RailButton>
          ))}
        </nav>
        {children}
      </div>
    </div>
  )
}

function RailButton({ label, active, muted, badge, onClick, children }: { label: string; active?: boolean; muted?: boolean; badge?: number; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} title={label} aria-label={label} aria-current={active ? 'page' : undefined}
      className={cx('relative grid size-12 shrink-0 place-items-center transition-all',
        active ? 'rounded-xl bg-brand text-on-brand' : 'rounded-full bg-chat-main text-muted hover:rounded-xl hover:bg-brand hover:text-on-brand',
        muted && !active && 'opacity-60')}>
      {active && <span className="absolute -left-3 h-8 w-1 rounded-r-full bg-fg" aria-hidden />}
      {children}
      {!!badge && <span className="absolute -bottom-0.5 -right-0.5 grid h-5 min-w-5 place-items-center rounded-full border-[3px] border-chat-rail bg-mustard px-1 text-[10px] font-bold text-navy" aria-hidden>{badge}</span>}
    </button>
  )
}

// ---------------- Inside a community: channels + chat ----------------

function GroupSpace({ group, channel, state, joined, onOpen, onDm, setMembership, onDeleted }: {
  group: Group; channel: string; state: Record<string, GroupState>; joined: string[]
  onOpen: (id: string, ch?: string) => void; onDm: (id: number) => void; setMembership: MembershipFn; onDeleted: () => void
}) {
  const isMember = joined.includes(group.id)
  const [membershipBusy, setMembershipBusy] = useState(false)
  const [notice, setNotice] = useState('')

  async function toggleMembership() {
    setMembershipBusy(true); setNotice('')
    try {
      await setMembership(group.id, !isMember)
      setNotice(isMember ? `You left ${group.name}.` : `Welcome to ${group.name}!`)
      if (!isMember) onOpen(group.id, group.channels[0])
    } catch (e) { setNotice((e as Error).message) }
    finally { setMembershipBusy(false) }
  }
  const [confirmDelete, setConfirmDelete] = useState(false)
  async function remove() {
    setConfirmDelete(false)
    setMembershipBusy(true)
    try { await api(`/api/community/groups/${group.id}`, { method: 'DELETE' }); onDeleted() }
    catch (e) { setNotice((e as Error).message); setMembershipBusy(false) }
  }

  return (
    <>
      <aside aria-label={`${group.name} channels`} className="hidden w-64 shrink-0 flex-col bg-chat-side md:flex">
        <div className="border-b border-black/25 p-4">
          <h1 className="flex items-center gap-1.5 text-lg font-semibold leading-snug">{group.name}{group.visibility === 'private' && <Lock className="size-4 shrink-0 text-muted" aria-label="Friends only" />}</h1>
          <p className="mt-0.5 flex items-center gap-1 text-sm text-muted"><Users className="size-3.5" aria-hidden />{memberLabel(state[group.id]?.members)}</p>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <p className="mb-1.5 px-2 text-sm font-semibold text-muted">Text channels</p>
          <ul className="space-y-0.5">
            {group.channels.map((c) => (
              <li key={c}>
                <button type="button" onClick={() => onOpen(group.id, c)} aria-current={c === channel ? 'page' : undefined}
                  className={cx('flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left font-medium transition',
                    c === channel ? 'bg-chat-active text-fg' : 'text-muted hover:bg-chat-active/50 hover:text-fg')}>
                  <Hash className="size-4 shrink-0" aria-hidden /><span className="truncate">{c}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-5 px-2 text-xs leading-relaxed text-muted">Be kind and keep personal contact details private.</p>
        </div>
        <div className="border-t border-black/25 p-3">
          {group.mine
            ? <Button variant="ghost" className="w-full justify-center text-sm" loading={membershipBusy} onClick={() => setConfirmDelete(true)}><Trash2 className="size-4" aria-hidden /> Delete community</Button>
            : isMember
              ? <Button variant="ghost" className="w-full justify-center text-sm" loading={membershipBusy} onClick={toggleMembership}><LogOut className="size-4" aria-hidden /> Leave community</Button>
              : <Button className="w-full justify-center" loading={membershipBusy} onClick={toggleMembership}><Plus className="size-4" aria-hidden /> Join community</Button>}
        </div>
      </aside>
      {confirmDelete && <Modal title={`Delete ${group.name}?`} onClose={() => setConfirmDelete(false)}>
        <p className="text-muted">All its channels and messages will be gone for everyone. This can’t be undone.</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmDelete(false)}>Cancel</Button>
          <Button variant="danger" onClick={remove}><Trash2 className="size-4" aria-hidden /> Delete</Button>
        </div>
      </Modal>}
      <Channel key={channel} group={group} channel={channel} isMember={isMember} onOpen={onOpen} onDm={onDm} onDelete={() => setConfirmDelete(true)}
        onToggleMembership={toggleMembership} membershipBusy={membershipBusy} notice={notice} />
    </>
  )
}

/** Next to a name in chat: add them as a friend, or message them if you already are. */
function PersonAction({ message, onDm, onFollowed }: { message: ChatMessage; onDm: (id: number) => void; onFollowed: (id: number, r: Relation) => void }) {
  const [busy, setBusy] = useState(false)
  const r = message.relation ?? 'none'
  if (r === 'me') return null
  if (r === 'friend') {
    return <button type="button" onClick={() => onDm(message.user_id)} className="chat-action"><MessageCircle className="size-3.5" aria-hidden />Message</button>
  }
  if (r === 'requested' || r === 'following') return <span className="text-xs text-muted">{r === 'requested' ? 'Requested' : 'Following'}</span>
  async function follow() {
    setBusy(true)
    try {
      await api(`/api/social/following/${message.user_id}`, { method: 'PUT' })
      // Public profile: you follow right away (friends if they already follow you). Private: it's a request.
      const me = await api<{ following?: number[] }>('/api/social/me').catch(() => null)
      const now = me?.following?.includes(message.user_id)
      onFollowed(message.user_id, now ? (r === 'follows-you' ? 'friend' : 'following') : 'requested')
    } finally { setBusy(false) }
  }
  return (
    <button type="button" onClick={follow} disabled={busy} className="chat-action">
      <UserPlus className="size-3.5" aria-hidden />{r === 'follows-you' ? 'Follow back' : 'Add friend'}
    </button>
  )
}

function Channel({ group, channel, isMember, onOpen, onDm, onDelete, onToggleMembership, membershipBusy, notice }: {
  group: Group; channel: string; isMember: boolean; onOpen: (id: string, ch?: string) => void; onDm: (id: number) => void; onDelete: () => void
  onToggleMembership: () => void; membershipBusy: boolean; notice: string
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const url = `/api/community/groups/${group.id}/channels/${channel}/messages`

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

  async function remove(id: number) {
    await api(`/api/community/messages/${id}`, { method: 'DELETE' })
    setMessages((prev) => prev.filter((m) => m.id !== id))
  }
  const setRelation = (id: number, relation: Relation) => setMessages((prev) => prev.map((m) => (m.user_id === id ? { ...m, relation } : m)))

  return (
    <section aria-label={`#${channel}`} className="flex min-w-0 flex-1 flex-col">
      <header className="border-b border-black/25 px-4 py-3">
        <div className="mb-2 flex items-center justify-between gap-2 md:hidden">
          <p className="truncate font-semibold">{group.name}</p>
          {group.mine
            ? <Button variant="ghost" className="shrink-0 px-2 py-1 text-sm" loading={membershipBusy} onClick={onDelete}><Trash2 className="size-4" aria-hidden /> Delete</Button>
            : isMember && <Button variant="ghost" className="shrink-0 px-2 py-1 text-sm" loading={membershipBusy} onClick={onToggleMembership}><LogOut className="size-4" aria-hidden /> Leave</Button>}
        </div>
        <div className="flex items-center gap-2">
          <Hash className="size-5 shrink-0 text-muted" aria-hidden />
          <h2 className="truncate font-semibold">{channel}</h2>
          <span className="hidden truncate border-l border-line pl-3 text-sm text-muted lg:inline">{topicFor(group, channel)}</span>
        </div>
        <div className="-mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1 pb-1 md:hidden" role="group" aria-label="Channels">
          {group.channels.map((c) => (
            <button key={c} type="button" onClick={() => onOpen(group.id, c)} aria-current={c === channel ? 'page' : undefined}
              className={cx('inline-flex shrink-0 items-center gap-1 rounded-full border px-3 py-1 text-sm font-medium',
                c === channel ? 'border-[var(--edge)] bg-fg text-bg' : 'border-[var(--edge)] text-fg')}>
              <Hash className="size-3.5" aria-hidden />{c}
            </button>
          ))}
        </div>
      </header>

      <MessageList loading={loading} empty={isMember ? 'No messages yet. Be the first to say hello!' : 'No messages yet. Join to start the conversation.'}
        intro={<><span className="grid size-14 place-items-center rounded-full bg-chat-input text-fg"><Hash className="size-7" aria-hidden /></span>
          <p className="mt-3 text-2xl font-semibold">Welcome to #{channel}</p><p className="mt-1 text-muted">{topicFor(group, channel)}</p></>}
        items={messages.map((m) => ({
          id: m.id, name: m.name, time: m.time, text: m.text, mine: m.mine, colorId: m.user_id, userId: m.user_id,
          nameNode: m.mine ? undefined : <Link to={`/people/${m.user_id}`} className="font-semibold hover:underline">{m.name}</Link>,
          action: <PersonAction message={m} onDm={onDm} onFollowed={setRelation} />,
        }))}
        onDelete={remove} error={error} onRetry={() => setRefresh((v) => v + 1)} />

      {isMember ? (
        <Composer label={`Message #${channel}`} notice={notice} onSend={async (text) => {
          const m = await api<ChatMessage>(url, { method: 'POST', body: { text } })
          setMessages((prev) => [...prev, m])
        }} />
      ) : (
        <div className="px-4 pb-3 pt-1">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-chat-input px-4 py-3">
            <p className="text-sm font-medium">Join {group.name} to post.</p>
            <Button loading={membershipBusy} onClick={onToggleMembership}><Plus className="size-4" aria-hidden /> Join</Button>
          </div>
          {notice && <p role="status" className="px-1 pt-1 text-sm text-muted">{notice}</p>}
        </div>
      )}
    </section>
  )
}

// ---------------- Direct messages ----------------

function DirectMessages({ personId, onPick, onRead }: { personId: number | null; onPick: (id: number) => void; onRead: () => void }) {
  const [convos, setConvos] = useState<Conversation[] | null>(null)
  const [error, setError] = useState('')
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let active = true
    const load = () => api<Conversation[]>('/api/dm/conversations')
      .then((c) => { if (active) setConvos(c) })
      .catch((e) => { if (active) setError((e as Error).message) })
    load()
    const t = setInterval(load, 20_000)
    return () => { active = false; clearInterval(t) }
  }, [tick])
  const current = convos?.find((c) => c.id === personId)

  return (
    <>
      <aside aria-label="Conversations" className={cx('w-full shrink-0 flex-col bg-chat-side md:flex md:w-64', personId ? 'hidden' : 'flex')}>
        <div className="border-b border-black/25 p-4">
          <h1 className="text-lg font-semibold">Direct messages</h1>
          <p className="mt-0.5 text-sm text-muted">Friends only</p>
        </div>
        <ul className="flex-1 space-y-0.5 overflow-y-auto p-2">
          {convos === null && !error && <li className="p-2 text-sm text-muted">Loading…</li>}
          {convos?.length === 0 && <li className="p-3 text-sm text-muted">Follow each other with someone to start messaging.</li>}
          {convos?.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => onPick(c.id)} aria-current={c.id === personId ? 'page' : undefined}
                className={cx('flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition', c.id === personId ? 'bg-chat-active' : 'hover:bg-chat-active/50')}>
                <UserAvatar id={c.id} name={c.name} className="size-9 text-xs" fallback={popDot(c.id)} />
                <span className="min-w-0 flex-1">
                  <span className={cx('block truncate text-sm', c.unread ? 'font-semibold text-fg' : 'font-medium text-fg/90')}>{c.name}</span>
                  <span className="block truncate text-xs text-muted">{c.last ? `${c.last.mine ? 'You: ' : ''}${c.last.text}` : 'Say hi'}</span>
                </span>
                {c.unread > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-mustard px-1.5 text-[11px] font-bold text-navy">{c.unread}</span>}
              </button>
            </li>
          ))}
        </ul>
        {error && <p role="alert" className="p-3 text-sm text-danger">{error}</p>}
      </aside>
      {personId ? <Thread key={personId} personId={personId} fallbackName={current?.name} onActivity={() => { setTick((v) => v + 1); onRead() }} />
        : (
          <section className="hidden flex-1 place-items-center p-8 text-center md:grid">
            <div><MessageCircle className="mx-auto size-10 text-muted" aria-hidden /><p className="mt-3 font-medium">Pick a friend to start chatting</p></div>
          </section>
        )}
    </>
  )
}

type Dm = { id: number; text: string; time: string; mine: boolean }
type ThreadData = { person: { id: number; name: string }; canMessage: boolean; messages: Dm[] }

function Thread({ personId, fallbackName, onActivity }: { personId: number; fallbackName?: string; onActivity: () => void }) {
  const meId = useAuth().user?.id
  const [data, setData] = useState<ThreadData | null>(null)
  const [error, setError] = useState('')
  const [, setSearch] = useSearchParams()
  useEffect(() => {
    let active = true
    let first = true
    const load = () => api<ThreadData>(`/api/dm/with/${personId}`)
      .then((d) => { if (active) { setData(d); setError(''); if (first) { first = false; onActivity() } } })
      .catch((e) => { if (active) setError((e as Error).message) })
    load()
    const t = setInterval(load, 10_000)
    return () => { active = false; clearInterval(t) }
  }, [personId]) // eslint-disable-line react-hooks/exhaustive-deps
  const name = data?.person.name ?? fallbackName ?? ''
  const firstName = name.split(' ')[0]

  return (
    <section aria-label={`Messages with ${name}`} className="flex min-w-0 flex-1 flex-col">
      <header className="flex items-center gap-3 border-b border-black/25 px-4 py-3">
        <button type="button" onClick={() => setSearch({ dm: '' })} className="md:hidden" aria-label="Back to conversations"><ArrowLeft className="size-5" aria-hidden /></button>
        <UserAvatar id={personId} name={name || '?'} className="size-8 text-xs" fallback={popDot(personId)} />
        <Link to={`/people/${personId}`} className="truncate font-semibold hover:underline">{name}</Link>
      </header>
      <MessageList loading={!data && !error} empty="No messages yet. Say hi!" error={error}
        intro={<><UserAvatar id={personId} name={name || '?'} className="size-14 text-lg" fallback={popDot(personId)} />
          <p className="mt-3 text-2xl font-semibold">{name}</p><p className="mt-1 text-muted">The start of your messages with {firstName}.</p></>}
        items={(data?.messages ?? []).map((m) => ({ id: m.id, name: m.mine ? 'You' : name, time: m.time, text: m.text, mine: m.mine, colorId: personId, userId: m.mine ? meId : personId }))}
        onDelete={async (id) => {
          await api(`/api/dm/messages/${id}`, { method: 'DELETE' })
          setData((d) => d && { ...d, messages: d.messages.filter((m) => m.id !== id) }); onActivity()
        }} />
      {data && !data.canMessage
        ? <p className="px-4 pb-4 text-sm text-muted">You can message {firstName} again once you follow each other.</p>
        : <Composer label={`Message ${firstName}`} onSend={async (text) => {
          const m = await api<Dm>(`/api/dm/with/${personId}`, { method: 'POST', body: { text } })
          setData((d) => d && { ...d, messages: [...d.messages, m] }); onActivity()
        }} />}
    </section>
  )
}

// ---------------- Shared chat pieces ----------------

type Item = { id: number; name: string; time: string; text: string; mine: boolean; colorId?: number; userId?: number; nameNode?: ReactNode; action?: ReactNode }

function MessageList({ items, loading, empty, intro, error, onDelete, onRetry }: {
  items: Item[]; loading: boolean; empty: string; intro: ReactNode; error?: string; onDelete: (id: number) => Promise<void>; onRetry?: () => void
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const { user } = useAuth()
  const [deleteError, setDeleteError] = useState('')
  useEffect(() => {
    const el = scroller.current
    if (el) el.scrollTop = el.scrollHeight
  }, [items.length, loading])
  return (
    <div ref={scroller} className="flex-1 overflow-y-auto px-4 py-4" aria-live="polite" aria-busy={loading}>
      <div className="mb-5 border-b border-line pb-5">{intro}</div>
      {loading ? <p className="text-sm text-muted">Loading messages…</p>
        : items.length === 0 && !error ? <p className="text-sm text-muted">{empty}</p>
        : (
          <ul className="-mx-4">
            {items.map((m) => (
              <li key={m.id} className="group flex gap-3 px-4 py-2 hover:bg-chat-hover">
                <UserAvatar id={m.userId} name={m.name === 'You' ? (user?.name ?? 'You') : m.name} className="size-10 text-sm" fallback={m.mine ? 'bg-brand text-on-brand' : popDot(m.colorId ?? 0)} />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-baseline gap-x-2">
                    {m.mine
                      ? <strong className="font-semibold">{m.name === 'You' ? 'You' : <>{m.name} <span className="font-normal text-muted">(you)</span></>}</strong>
                      : (m.nameNode ?? <strong className="font-semibold">{m.name}</strong>)}
                    <time className="text-xs text-muted" dateTime={m.time}>{fmtCalgary(new Date(m.time), { dateStyle: 'medium', timeStyle: 'short' })}</time>
                    {m.action && <span className="opacity-0 transition focus-within:opacity-100 group-hover:opacity-100">{m.action}</span>}
                  </p>
                  <p className="whitespace-pre-wrap break-words leading-relaxed">{m.text}</p>
                </div>
                {m.mine && (
                  <button type="button" onClick={() => { onDelete(m.id).catch((e) => setDeleteError((e as Error).message)) }} aria-label="Delete your message" title="Delete"
                    className="grid size-8 shrink-0 place-items-center self-start rounded-lg text-muted opacity-0 transition hover:bg-chat-input hover:text-danger focus:opacity-100 group-hover:opacity-100">
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      {(error || deleteError) && <p className="mt-3 text-sm text-danger" role="alert">{error || deleteError} {onRetry && <button type="button" className="font-semibold underline" onClick={onRetry}>Retry</button>}</p>}
    </div>
  )
}

function Composer({ label, onSend, notice }: { label: string; onSend: (text: string) => Promise<void>; notice?: string }) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  async function send(e?: FormEvent) {
    e?.preventDefault()
    if (!text.trim() || sending) return
    setSending(true); setError('')
    try { await onSend(text.trim()); setText('') } catch (err) { setError((err as Error).message) } finally { setSending(false) }
  }
  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send() }
  }
  return (
    <div className="px-4 pb-3 pt-1">
      <form onSubmit={send}>
        <label htmlFor="chat-message" className="sr-only">{label}</label>
        <div className="flex items-end gap-2 rounded-xl bg-chat-input p-1.5 focus-within:ring-2 focus-within:ring-brand-edge">
          <textarea id="chat-message" rows={1} value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} onKeyDown={onKeyDown}
            placeholder={label} className="max-h-40 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 outline-none placeholder:text-muted/80" />
          <Button type="submit" className="size-10 shrink-0 justify-center p-0" loading={sending} disabled={!text.trim()} aria-label="Send message">
            {!sending && <Send className="size-4" aria-hidden />}
          </Button>
        </div>
      </form>
      <p role="status" className="px-1 pt-1 text-sm">
        {error ? <span className="text-danger">{error}</span> : notice ? <span className="text-muted">{notice}</span> : null}
      </p>
    </div>
  )
}
