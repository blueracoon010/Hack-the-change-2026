import { useEffect, useState } from 'react'
import { Users, UserPlus } from 'lucide-react'
import { api } from '../lib/api'
import { readSocialDemo } from './SocialLinks'
import { useAuth } from '../context/AuthContext'
import { Button, Card } from './ui'

type Connections = { people: { id: number; name: string; instagram?: string; reasons?: string[]; suggested?: boolean }[]; followers: number[]; following: number[] }
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

  async function toggle(id: number) {
    if (!connections || busy) return
    const isFollowing = connections.following.includes(id)
    setBusy(true); setError(''); setNotice('')
    try {
      if (user) {
        await api(`/api/social/following/${id}`, { method: isFollowing ? 'DELETE' : 'PUT' })
        // Always reload server state: counts and previews come from the same edges.
        setConnections(await api<Connections>('/api/social/me'))
        setNotice(isFollowing ? 'Unfollowed.' : 'Following.')
      } else {
        const following = isFollowing ? connections.following.filter(v => v !== id) : [...connections.following, id]
        setConnections({ ...connections, following, people: connections.people.map(p => ({ ...p, suggested: !!p.reasons?.length && !following.includes(p.id) })) })
        try { localStorage.setItem(demoKey, JSON.stringify(following)); setNotice('Demo updated on this device.') } catch { setNotice('Updated for this session; browser storage is unavailable.') }
      }
    } catch (e) { setError(`${(e as Error).message} Refresh connections to confirm the latest state.`) } finally { setBusy(false) }
  }
  const visible = connections?.people.filter(p => (view === 'people' || (view === 'suggested' ? p.suggested : connections[view].includes(p.id))) && p.name.toLowerCase().includes(search.toLowerCase())) ?? []
  return <Card><div className="flex items-center gap-2"><Users size={20} className="text-brand-strong" aria-hidden /><h2 className="text-xl font-extrabold">Your connections</h2></div><p className="mt-2 text-sm text-muted">{user ? 'Follow people to keep your community close. Connections are stored with your account.' : 'Demo mode · sample followers and people. Follow changes stay on this device.'}</p>
    {connections && <><div className="my-5 grid grid-cols-2 gap-3">{(['followers', 'following'] as const).map(tab => <button type="button" key={tab} aria-pressed={view === tab} onClick={() => { setView(tab); setSearch('') }} className={`rounded-xl border p-4 text-left ${view === tab ? 'border-brand bg-brand-tint' : 'border-line hover:bg-surface-2'}`}><span className="block text-2xl font-extrabold">{connections[tab].length}</span><span className="text-sm font-bold capitalize">{tab}</span></button>)}</div><div className="mb-4 flex flex-wrap gap-2"><Button variant={view === 'people' ? 'primary' : 'secondary'} onClick={() => { setView('people'); setSearch('') }}><UserPlus size={16} /> Find people</Button><Button variant={view === 'suggested' ? 'primary' : 'secondary'} onClick={() => { setView('suggested'); setSearch('') }}>Suggested for you</Button><Button variant="ghost" disabled={busy} onClick={() => setRetry(v => v + 1)}>Refresh connections</Button></div><label className="block text-sm font-bold">Search {view === 'people' ? 'people' : view}<input className="my-2 block w-full rounded-xl border border-line bg-surface p-3 font-normal" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by display name" /></label><div className="max-h-80 space-y-3 overflow-auto" aria-label={`${view} preview`}>{visible.map(person => <div key={person.id} className="flex items-center gap-3 rounded-xl border border-line p-3"><span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-tint font-extrabold text-brand-strong" aria-hidden>{person.name[0]}</span><div className="min-w-0 flex-1"><p className="break-words font-bold">{person.name}</p>{person.reasons?.map(reason => <p key={reason} className="mt-1 text-xs text-muted">{reason}</p>)}{person.instagram && <a className="mt-1 block text-xs font-bold text-brand-strong" href={`https://www.instagram.com/${encodeURIComponent(person.instagram)}/`} target="_blank" rel="noreferrer">@{person.instagram} ↗ (self-reported)</a>}{connections.followers.includes(person.id) && <p className="text-xs text-muted">Follows you</p>}</div><Button variant={connections.following.includes(person.id) ? 'secondary' : 'primary'} disabled={busy} onClick={() => toggle(person.id)} aria-label={`${connections.following.includes(person.id) ? 'Unfollow' : 'Follow'} ${person.name}`}>{connections.following.includes(person.id) ? 'Unfollow' : 'Follow'}</Button></div>)}{visible.length === 0 && <p className="py-5 text-sm text-muted">{search ? 'No matching people.' : view === 'followers' ? 'No followers yet. New connections take time.' : view === 'following' ? 'You aren’t following anyone yet. Choose Find people to get started.' : view === 'suggested' ? 'No suggestions yet. Enable social discovery and choose interests below. Matches appear when others opt in, too.' : 'No other accounts yet. Create a second account to test following.'}</p>}</div></>}
    {!connections && !error && <p className="mt-4 text-muted" role="status">Loading connections…</p>}<p className="mt-3 text-sm text-success" role="status">{notice}</p>{error && <div className="mt-3" role="alert"><p className="text-sm text-danger">{error}</p><Button variant="secondary" className="mt-2" onClick={() => setRetry(v => v + 1)}>Retry</Button></div>}
  </Card>
}

