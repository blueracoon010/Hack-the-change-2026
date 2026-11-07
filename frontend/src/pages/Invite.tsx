import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { Button, Card } from '../components/ui'

type Inviter = { id: number; name: string; instagram: string }
export default function Invite() {
  const { token } = useParams()
  const { user, ready } = useAuth()
  const [person, setPerson] = useState<Inviter | null>(null)
  const [error, setError] = useState('')
  const [following, setFollowing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [retry, setRetry] = useState(0)
  const from = `/invite/${encodeURIComponent(token ?? '')}`
  useEffect(() => {
    let active = true
    setPerson(null); setError(''); setFollowing(false); setNotice('')
    if (!ready) return
    async function load() {
      try {
        const invited = await api<Inviter>(`/api/social/invite/${encodeURIComponent(token ?? '')}`)
        const state = user ? await api<{ following: number[] }>('/api/social/me') : null
        if (active) { setPerson(invited); setFollowing(state?.following.includes(invited.id) ?? false) }
      } catch (e) { if (active) setError((e as Error).message) }
    }
    load()
    return () => { active = false }
  }, [token, user?.id, ready, retry])
  async function follow() {
    if (!person || !user) return
    setBusy(true); setError('')
    try { await api(`/api/social/following/${person.id}`, { method: following ? 'DELETE' : 'PUT' }); setFollowing(!following); setNotice(following ? 'Unfollowed.' : `You’re now following ${person.name}.`) } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  return <main className="mx-auto max-w-xl px-5 py-16"><Card><p className="text-sm font-bold uppercase tracking-widest text-brand-strong">Corkboard YYC · You’re invited</p>{person ? <><h1 className="mt-5 text-3xl font-extrabold">Connect with {person.name}</h1><p className="my-5 text-muted">Find familiar faces and new experiences in Calgary. Following is always your choice.</p>{person.instagram && <a className="mb-5 block font-bold text-brand-strong" href={`https://www.instagram.com/${encodeURIComponent(person.instagram)}/`} target="_blank" rel="noreferrer">@{person.instagram} on Instagram ↗ (self-reported)</a>}{user ? user.id === person.id ? <p>This is your invitation link.</p> : <Button onClick={follow} loading={busy}>{following ? 'Unfollow' : `Follow ${person.name}`}</Button> : <div className="flex gap-4"><Link to="/signup" state={{ from }} className="rounded-xl bg-brand px-4 py-3 font-bold text-white">Create account</Link><Link to="/login" state={{ from }} className="rounded-xl border border-line px-4 py-3 font-bold">Sign in</Link></div>}</> : !error && <p className="mt-5" role="status">Loading invitation…</p>}{error && <div role="alert" className="my-4"><p className="text-danger">{error}</p><Button variant="secondary" className="mt-3" onClick={() => setRetry(v => v + 1)}>Retry</Button></div>}<p className="mt-4 text-success" role="status">{notice}</p><Link to="/profile" className="mt-6 inline-block font-bold text-brand-strong">Go to your profile</Link></Card></main>
}
