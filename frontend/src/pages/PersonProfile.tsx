// Another member's profile, from the shared database (GET /api/social/people/:id).
// Only the name and follow counts are shown unless that person made their profile Public (Profile → About me).
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CalendarDays, Coffee, Lock, MapPin, Sparkles, UserCheck, UserPlus } from 'lucide-react'
import { Button, Card, ErrorState, Loading } from '../components/ui'
import { api, ApiError } from '../lib/api'
import { fmtWhen } from '../lib/nexus'

type Person = {
  id: number; name: string; joined: string; is_me: boolean; private: boolean
  follower_count: number; following_count: number; is_following: boolean; follows_you: boolean
  bio?: string; neighbourhood?: string; social_style?: string; interests?: string[]; shared_interests?: string[]
  instagram?: string; events?: { id: string; title: string; start: string; venue: string }[]
}

export default function PersonProfile() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [person, setPerson] = useState<Person | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [busy, setBusy] = useState(false)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    let active = true
    setPerson(null); setError(null)
    api<Person>(`/api/social/people/${encodeURIComponent(id ?? '')}`)
      .then(p => { if (active) setPerson(p) })
      .catch(e => { if (active) setError(e instanceof ApiError ? e : new ApiError(0, String(e))) })
    return () => { active = false }
  }, [id, retry])

  async function toggleFollow() {
    if (!person || busy) return
    setBusy(true)
    try {
      await api(`/api/social/following/${person.id}`, { method: person.is_following ? 'DELETE' : 'PUT' })
      setPerson(await api<Person>(`/api/social/people/${person.id}`))
      window.dispatchEvent(new Event('corkboard-social-updated'))
    } catch (e) { setError(e instanceof ApiError ? e : new ApiError(0, String(e))) } finally { setBusy(false) }
  }

  const back = <button type="button" onClick={() => navigate(-1)} className="-ml-2 inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-sm font-bold text-muted hover:bg-surface-2 hover:text-fg"><ArrowLeft size={16} aria-hidden /> Back</button>
  if (error) return <div className="mx-auto max-w-3xl space-y-4">{back}<ErrorState message={error.status === 404 ? 'This person isn’t on Nexus (anymore).' : error.message} onRetry={error.status === 404 ? undefined : () => setRetry(v => v + 1)} /></div>
  if (!person) return <Loading label="Loading profile" />

  const joined = new Date(person.joined).toLocaleDateString('en-CA', { month: 'long', year: 'numeric' })
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {back}
      <header className="overflow-hidden rounded-3xl border border-line bg-surface shadow-sm">
        <div className="h-24 bg-brand-tint sm:h-28" aria-hidden="true" />
        <div className="px-5 pb-6 sm:px-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="-mt-10 grid size-24 place-items-center rounded-3xl border-4 border-surface bg-brand text-4xl font-extrabold text-white shadow-sm" aria-hidden="true">{person.name[0]?.toUpperCase()}</div>
            {person.is_me
              ? <Link to="/profile" className="rounded-full border border-line px-4 py-2 text-sm font-bold hover:bg-surface-2">Edit my profile</Link>
              : <Button variant={person.is_following ? 'secondary' : 'primary'} loading={busy} onClick={toggleFollow} aria-label={`${person.is_following ? 'Unfollow' : 'Follow'} ${person.name}`}>
                  {person.is_following ? <><UserCheck size={16} aria-hidden /> Following</> : <><UserPlus size={16} aria-hidden /> Follow</>}
                </Button>}
          </div>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight">{person.name}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
            {person.neighbourhood && <span className="inline-flex items-center gap-1.5"><MapPin size={15} aria-hidden />{person.neighbourhood}</span>}
            <span>Joined {joined}</span>
            <span><strong className="text-fg">{person.follower_count}</strong> followers · <strong className="text-fg">{person.following_count}</strong> following</span>
            {person.follows_you && !person.is_me && <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-bold">Follows you</span>}
          </p>
          {person.bio && <p className="mt-4 whitespace-pre-wrap break-words leading-relaxed text-muted">{person.bio}</p>}
          {person.social_style && !person.private && <span className="mt-4 inline-flex items-center gap-2 rounded-full bg-accent-soft px-3 py-1.5 text-sm font-bold text-accent-strong"><Coffee size={15} aria-hidden />{person.social_style}</span>}
        </div>
      </header>

      {person.private ? (
        <Card><p className="flex items-start gap-3 text-muted"><Lock size={20} className="mt-0.5 shrink-0" aria-hidden />
          {person.name.split(' ')[0]} keeps their profile private. You can still follow them; they choose what to share.</p></Card>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2">
          <Card>
            <h2 className="text-lg font-extrabold">Interests</h2>
            {person.interests?.length ? <div className="mt-4 flex flex-wrap gap-2">{person.interests.map(i =>
              <span key={i} className={`rounded-full px-3 py-1.5 text-sm font-bold ${person.shared_interests?.includes(i) ? 'bg-brand-tint text-brand-strong' : 'bg-surface-2'}`}>{i}</span>)}</div>
              : <p className="mt-3 text-sm text-muted">No interests added yet.</p>}
            {!!person.shared_interests?.length && <p className="mt-4 flex items-center gap-1.5 text-sm font-bold text-brand-strong"><Sparkles size={15} aria-hidden /> You both like {person.shared_interests.join(', ')}</p>}
            {person.instagram && <a href={`https://www.instagram.com/${encodeURIComponent(person.instagram)}/`} target="_blank" rel="noreferrer" className="mt-4 inline-block text-sm font-bold text-brand-strong">@{person.instagram} on Instagram ↗ <span className="font-normal text-muted">(self-reported)</span></a>}
          </Card>
          <Card>
            <h2 className="flex items-center gap-2 text-lg font-extrabold"><CalendarDays size={18} aria-hidden /> Events they’re hosting</h2>
            {person.events?.length ? <ul className="mt-4 space-y-2">{person.events.map(e =>
              <li key={e.id} className="rounded-xl border border-line p-3"><p className="font-bold leading-snug">{e.title}</p><p className="text-sm text-muted">{fmtWhen(new Date(e.start))}{e.venue && ` · ${e.venue}`}</p></li>)}</ul>
              : <p className="mt-3 text-sm text-muted">No upcoming events.</p>}
          </Card>
        </div>
      )}
    </div>
  )
}
