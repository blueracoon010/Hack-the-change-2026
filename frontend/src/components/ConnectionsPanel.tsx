import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Users, UserPlus, RefreshCw, X } from 'lucide-react'
import { api } from '../lib/api'
import { readSocialDemo } from './SocialLinks'
import { useAuth } from '../context/AuthContext'
import { Button, Card } from './ui'
import { UserAvatar } from './UserAvatar'

type Connections = {
  people: { id: number; name: string; instagram?: string; reasons?: string[]; suggested?: boolean }[]; followers: number[]; following: number[]
  /** Private accounts you asked to follow (waiting for them). */ requested?: number[]
  /** People asking to follow you. */ requests?: { id: number; name: string }[]
}
const demo: Connections = { people: [{ id: -1, name: 'Ana · demo' }, { id: -2, name: 'Raj · demo' }, { id: -3, name: 'Sam · demo' }, { id: -4, name: 'Maya · demo' }], followers: [-1, -2], following: [-2] }
const demoKey = 'corkboard-demo-connections-v1'
function readDemo(): Connections {
  try {
    const ids: unknown = JSON.parse(localStorage.getItem(demoKey) ?? 'null')
    if (Array.isArray(ids)) return { ...demo, following: demo.people.filter(p => ids.includes(p.id)).map(p => p.id) }
  } catch { /* Local storage unavailable. */ }
  return demo
}

export function ConnectionsPanel() {
  const { user, ready } = useAuth()
  const [connections, setConnections] = useState<Connections | null>(null)
  const [view, setView] = useState<'followers' | 'following' | 'people' | 'suggested'>('people')
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true
    setConnections(null); setError(''); setNotice('')
    if (!ready) return
    if (!user) {
      const state = readDemo()
      const social = readSocialDemo()
      const sampleInterests: Record<number, string[]> = { [-1]: ['Walking & outdoors', 'Books'], [-2]: ['Music', 'Sports'], [-3]: ['Art & culture'], [-4]: ['Coffee & conversation', 'Books'] }
      setConnections({ ...state, people: state.people.map(p => {
        const shared = social.discoverable ? social.interests.filter(i => sampleInterests[p.id]?.includes(i)) : []
        return { ...p, suggested: shared.length > 0 && !state.following.includes(p.id), reasons: shared.length ? [`Shared interests (demo): ${shared.join(', ')}`] : [] }
      }) }); return
    }
    api<Connections>('/api/social/me').then(result => { if (active) setConnections(result) }).catch(e => { if (active) setError(e.message) })
    return () => { active = false }
  }, [user?.id, ready, retry])

  useEffect(() => {
    const refresh = () => setRetry(v => v + 1)
    window.addEventListener('corkboard-social-updated', refresh)
    return () => window.removeEventListener('corkboard-social-updated', refresh)
  }, [])

  async function answer(id: number, accept: boolean) {
    if (busy) return
    setBusy(true); setError(''); setNotice('')
    try {
      await api(accept ? `/api/social/requests/${id}/accept` : `/api/social/requests/${id}`, { method: accept ? 'POST' : 'DELETE' })
      setConnections(await api<Connections>('/api/social/me'))
      setNotice(accept ? 'Request accepted. They can now see your profile.' : 'Request declined.')
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  async function toggle(id: number) {
    if (!connections || busy) return
    const isFollowing = connections.following.includes(id)
    const isRequested = !!connections.requested?.includes(id)
    setBusy(true); setError(''); setNotice('')
    try {
      if (user) {
        await api(`/api/social/following/${id}`, { method: isFollowing || isRequested ? 'DELETE' : 'PUT' })
        // Always reload server state: counts and previews come from the same edges.
        const next = await api<Connections>('/api/social/me')
        setConnections(next)
        setNotice(isFollowing ? 'Unfollowed.' : isRequested ? 'Request cancelled.'
          : next.requested?.includes(id) ? 'Request sent. You’ll see their profile once they accept.' : 'Following.')
      } else {
        const following = isFollowing ? connections.following.filter(v => v !== id) : [...connections.following, id]
        setConnections({ ...connections, following, people: connections.people.map(p => ({ ...p, suggested: !!p.reasons?.length && !following.includes(p.id) })) })
        try { localStorage.setItem(demoKey, JSON.stringify(following)); setNotice('Demo updated on this device.') } catch { setNotice('Updated for this session; browser storage is unavailable.') }
      }
    } catch (e) { setError(`${(e as Error).message} Refresh connections to confirm the latest state.`) } finally { setBusy(false) }
  }
  const visible = connections?.people.filter(p => (view === 'people' || (view === 'suggested' ? p.suggested : connections[view].includes(p.id))) && p.name.toLowerCase().includes(search.toLowerCase())) ?? []
  return <Card><div className="flex items-center gap-2"><Users size={20} className="text-brand-strong" aria-hidden /><h2 className="text-xl font-extrabold">Connections</h2></div><p className="mt-2 text-sm text-muted">{user ? 'Your people, all in one place.' : 'Demo people · saved on this device.'}</p>
    {connections && !!connections.requests?.length && <section aria-label="Follow requests" className="mt-5 rounded-2xl border border-brand/40 bg-brand-tint/50 p-4">
      <h3 className="font-extrabold">Follow requests <span className="ml-1 rounded-full bg-brand px-2 py-0.5 text-xs text-white">{connections.requests.length}</span></h3>
      <p className="mt-0.5 text-sm text-muted">Accept to let them see your profile.</p>
      <ul className="mt-3 space-y-2">{connections.requests.map(r => <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface p-3">
        <UserAvatar id={r.id} name={r.name} className="size-10 text-sm" />
        <Link to={`/people/${r.id}`} className="min-w-0 flex-1 break-words font-bold hover:text-brand-strong hover:underline">{r.name}</Link>
        <Button disabled={busy} onClick={() => answer(r.id, true)} aria-label={`Accept ${r.name}`}><Check size={16} aria-hidden /> Accept</Button>
        <Button variant="secondary" disabled={busy} onClick={() => answer(r.id, false)} aria-label={`Decline ${r.name}`}><X size={16} aria-hidden /> Decline</Button>
      </li>)}</ul>
    </section>}
    {connections && <><div className="my-5 grid grid-cols-2 gap-3">{(['followers', 'following'] as const).map(tab => <button type="button" key={tab} aria-pressed={view === tab} onClick={() => { setView(tab); setSearch('') }} className={`rounded-xl border p-4 text-left ${view === tab ? 'border-brand bg-brand-tint' : 'border-line hover:bg-surface-2'}`}><span className="block text-2xl font-extrabold">{connections[tab].length}</span><span className="text-sm font-bold capitalize">{tab}</span></button>)}</div><div className="mb-4 flex flex-wrap gap-2"><Button variant={view === 'people' ? 'primary' : 'secondary'} onClick={() => { setView('people'); setSearch('') }}><UserPlus size={16} /> Find people</Button><Button variant={view === 'suggested' ? 'primary' : 'secondary'} onClick={() => { setView('suggested'); setSearch('') }}>Suggested</Button><Button variant="ghost" disabled={busy} onClick={() => setRetry(v => v + 1)} aria-label="Refresh connections" title="Refresh connections"><RefreshCw size={17} /></Button></div><label className="block text-sm font-bold">Search {view === 'people' ? 'people' : view}<input className="my-2 block w-full rounded-xl border border-line bg-surface p-3 font-normal" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search people…" /></label><div className="max-h-80 space-y-3 overflow-auto" aria-label={`${view} preview`}>{visible.map(person => <div key={person.id} className="flex items-center gap-3 rounded-xl border border-line p-3"><UserAvatar id={person.id > 0 ? person.id : undefined} name={person.name} className="size-10 text-sm" /><div className="min-w-0 flex-1">{person.id > 0 ? <Link to={`/people/${person.id}`} className="break-words font-bold hover:text-brand-strong hover:underline">{person.name}</Link> : <p className="break-words font-bold">{person.name}</p>}{person.reasons?.map(reason => <p key={reason} className="mt-1 text-xs text-muted">{reason}</p>)}{person.instagram && <a className="mt-1 block text-xs font-bold text-brand-strong" href={`https://www.instagram.com/${encodeURIComponent(person.instagram)}/`} target="_blank" rel="noreferrer">@{person.instagram}</a>}{connections.followers.includes(person.id) && <p className="text-xs text-muted">Follows you</p>}</div><FollowButton following={connections.following.includes(person.id)} requested={!!connections.requested?.includes(person.id)} disabled={busy} name={person.name} onClick={() => toggle(person.id)} /></div>)}{visible.length === 0 && <p className="py-5 text-sm text-muted">{search ? 'No matching people.' : view === 'followers' ? 'No followers yet.' : view === 'following' ? 'You aren’t following anyone yet. Choose Find people to get started.' : view === 'suggested' ? 'No matches yet. Add interests and make your profile public under About me.' : 'No other people yet.'}</p>}</div></>}
    {!connections && !error && <p className="mt-4 text-muted" role="status">Loading connections…</p>}<p className="mt-3 text-sm text-success" role="status">{notice}</p>{error && <div className="mt-3" role="alert"><p className="text-sm text-danger">{error}</p><Button variant="secondary" className="mt-2" onClick={() => setRetry(v => v + 1)}>Retry</Button></div>}
  </Card>
}

/** Follow → Requested (private account, waiting) → Following. Tapping Requested cancels; tapping Following unfollows. */
function FollowButton({ following, requested, disabled, name, onClick }: { following: boolean; requested: boolean; disabled: boolean; name: string; onClick: () => void }) {
  const label = following ? 'Following' : requested ? 'Requested' : 'Follow'
  const action = following ? `Unfollow ${name}` : requested ? `Cancel follow request to ${name}` : `Follow ${name}`
  return <Button variant={following || requested ? 'secondary' : 'primary'} disabled={disabled} onClick={onClick} aria-label={action} title={following ? 'Unfollow' : requested ? 'Cancel request' : undefined}>{label}</Button>
}
