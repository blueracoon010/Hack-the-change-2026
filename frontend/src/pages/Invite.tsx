// Opened from an invite link or code (#/invite/CODE). Works signed out: shows who invited you, then sign up or
// sign in and come straight back here to become friends (you follow each other) in one tap.
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Check, UserPlus } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { APP } from '../config/app'
import { Button, Card } from '../components/ui'
import { Logo } from '../components/Logo'

type Inviter = { id: number; name: string; instagram: string }
type PersonState = { is_following: boolean; follows_you: boolean }

export default function Invite() {
  const { token: code = '' } = useParams()
  const { user, ready } = useAuth()
  const navigate = useNavigate()
  const [person, setPerson] = useState<Inviter | null>(null)
  const [friends, setFriends] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [retry, setRetry] = useState(0)
  const from = `/invite/${encodeURIComponent(code)}`

  useEffect(() => {
    let active = true
    setPerson(null); setError(''); setFriends(false)
    if (!ready) return
    ;(async () => {
      try {
        const inviter = await api<Inviter>(`/api/social/invite/${encodeURIComponent(code)}`)
        const state = user && user.id !== inviter.id ? await api<PersonState>(`/api/social/people/${inviter.id}`) : null
        if (active) { setPerson(inviter); setFriends(!!state?.is_following && !!state?.follows_you) }
      } catch (e) { if (active) setError((e as Error).message) }
    })()
    return () => { active = false }
  }, [code, user?.id, ready, retry])

  async function accept() {
    setBusy(true); setError('')
    try {
      await api(`/api/social/invite/${encodeURIComponent(code)}/accept`, { method: 'POST' })
      setFriends(true)
      window.dispatchEvent(new Event('corkboard-social-updated'))
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <main className="mx-auto grid min-h-screen max-w-xl content-center px-5 py-16">
      <div className="mb-6"><Logo /></div>
      <Card>
        <p className="text-sm font-bold uppercase tracking-widest text-brand-strong">You’re invited</p>
        {person ? <>
          <div className="mt-5 flex items-center gap-4">
            <span className="grid size-16 shrink-0 place-items-center rounded-2xl bg-brand text-2xl font-extrabold text-white" aria-hidden>{person.name[0]?.toUpperCase()}</span>
            <h1 className="text-3xl font-extrabold leading-tight">{user?.id === person.id ? 'This is your invite' : `${person.name} invited you`}</h1>
          </div>
          <p className="my-5 text-muted">{APP.name} shows what’s on around you in Calgary, and who you know is going. Friends see each other’s plans and can go together.</p>
          {person.instagram && <a className="mb-5 block font-bold text-brand-strong" href={`https://www.instagram.com/${encodeURIComponent(person.instagram)}/`} target="_blank" rel="noreferrer">@{person.instagram} on Instagram ↗ <span className="font-normal text-muted">(self-reported)</span></a>}

          {!user ? (
            <div className="space-y-3">
              <p className="font-bold">Create an account (or sign in) to become friends with {person.name.split(' ')[0]}.</p>
              <div className="flex flex-wrap gap-3">
                <Link to="/signup" state={{ from }} className="btn-primary rounded-full px-5 py-2.5 font-bold">Create account</Link>
                <Link to="/login" state={{ from }} className="rounded-full border border-line px-5 py-2.5 font-bold hover:bg-surface-2">Sign in</Link>
              </div>
            </div>
          ) : user.id === person.id ? (
            <p className="text-muted">Share it with a friend from <Link to="/profile?section=social" className="font-bold text-brand-strong">Profile → Social & invites</Link>.</p>
          ) : friends ? (
            <div className="space-y-4" role="status">
              <p className="flex items-center gap-2 rounded-2xl bg-brand-tint p-4 font-bold text-brand-strong"><Check size={18} aria-hidden /> You and {person.name.split(' ')[0]} are friends.</p>
              <div className="flex flex-wrap gap-3">
                <Button onClick={() => navigate(`/people/${person.id}`)}>See their profile</Button>
                <Button variant="secondary" onClick={() => navigate('/')}>Explore events</Button>
              </div>
            </div>
          ) : (
            <Button onClick={accept} loading={busy}><UserPlus size={16} aria-hidden /> Add {person.name.split(' ')[0]} as a friend</Button>
          )}
          {user && user.id !== person.id && !friends && <p className="mt-3 text-xs text-muted">You’ll follow each other. You can unfollow any time from their profile.</p>}
        </> : !error && <p className="mt-5" role="status">Loading invite…</p>}
        {error && <div role="alert" className="mt-4"><p className="text-danger">{error}</p>
          <div className="mt-3 flex gap-3"><Button variant="secondary" onClick={() => setRetry(v => v + 1)}>Try again</Button>
            <Link to={user ? '/profile?section=social' : '/login'} className="self-center font-bold text-brand-strong">{user ? 'Enter a different code' : 'Sign in'}</Link></div></div>}
      </Card>
    </main>
  )
}
