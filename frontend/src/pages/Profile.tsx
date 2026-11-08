import { useEffect, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { MapPin, Users, Check, Pencil, Heart, Link2, ArrowUpRight, Coffee, BookOpen, Music, Palette, Footprints, Trophy, HandHeart, CalendarDays, Bookmark, Award, Sun, Settings as SettingsIcon, type LucideIcon } from 'lucide-react'
import { Button, Card, Field } from '../components/ui'
import { groups, interests, useCommunityGroups, useCommunityState, type LocalProfile } from '../lib/community'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import type { User } from '../lib/types'
import type { SocialDetails } from '../components/SocialLinks'
import { ConnectionsPanel } from '../components/ConnectionsPanel'
import { SocialLinks } from '../components/SocialLinks'
import { BuddyPreferences } from '../components/BuddyPreferences'
import { MyEvents } from '../components/MyEvents'
import { SavedEvents } from '../components/SavedEvents'
import Calendar from './Calendar'
import { Badges, useBadgeSummary } from '../components/Badges'

const interestIcons = [Footprints, BookOpen, Palette, Music, Trophy, Coffee]
const GROUP_ICONS: Record<string, LucideIcon> = { walk: Sun, books: BookOpen, art: Palette, coffee: Coffee }
const sections = [
  { id: 'about', label: 'About me', icon: Heart },
  { id: 'badges', label: 'Badges', icon: Award },
  { id: 'events', label: 'My events', icon: CalendarDays },
  { id: 'saved', label: 'Saved', icon: Bookmark },
  { id: 'calendar', label: 'Calendar', icon: CalendarDays },
  { id: 'connections', label: 'Connections', icon: Users },
  { id: 'social', label: 'Social & invites', icon: Link2 },
  { id: 'buddy', label: 'Go together', icon: HandHeart },
] as const

export default function Profile() {
  const { data, update, storageError } = useCommunityState()
  const { user, setUser } = useAuth()
  // Signed in: the profile lives in the (shared) database so other members can view it. Signed out: this device only.
  const [account, setAccount] = useState<SocialDetails | null>(null)
  const [reload, setReload] = useState(0)
  const [saveError, setSaveError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!user) return
    let active = true
    // If the server is briefly unreachable (e.g. restarting), try again rather than falling back to device-only mode.
    let timer: ReturnType<typeof setTimeout> | undefined
    const load = (attempt: number) => api<SocialDetails>('/api/social/profile')
      .then(r => { if (active) setAccount(r) })
      .catch(() => { if (active && attempt < 5) timer = setTimeout(() => load(attempt + 1), 2000 * (attempt + 1)) })
    load(0)
    return () => { active = false; clearTimeout(timer) }
  }, [user?.id, reload])
  useEffect(() => {
    const refresh = () => setReload(v => v + 1)
    window.addEventListener('corkboard-social-updated', refresh) // Social links form saved (interests / discovery)
    return () => window.removeEventListener('corkboard-social-updated', refresh)
  }, [])
  const profile: LocalProfile = user && account
    ? { name: user.name, bio: account.bio ?? '', neighbourhood: account.neighbourhood ?? '', social: account.social_style ?? 'A little of both', interests: account.interests }
    : data.profile
  const [draft, setDraft] = useState(profile)
  const [editing, setEditing] = useState(false)
  const [saved, setSaved] = useState(false)
  const [params, setParams] = useSearchParams()
  const section = sections.find(s => s.id === params.get('section'))?.id ?? 'about'
  const setSection = (id: typeof sections[number]['id']) => setParams({ section: id })
  const { joined: joinedIds } = useCommunityGroups()
  const badges = useBadgeSummary()
  const [counts, setCounts] = useState<{ followers: number; following: number } | null>(null)
  useEffect(() => {
    if (!user) return
    const load = () => api<{ follower_count: number; following_count: number }>('/api/social/me').then(r => setCounts({ followers: r.follower_count, following: r.following_count })).catch(() => {})
    void load()
    window.addEventListener('corkboard-social-updated', load)
    return () => window.removeEventListener('corkboard-social-updated', load)
  }, [user?.id])
  const joined = groups.filter(g => joinedIds.includes(g.id))
  function edit() { setDraft(profile); setEditing(true); setSection('about'); setSaved(false); setSaveError('') }
  async function save(e: FormEvent) {
    e.preventDefault()
    if (!draft.name.trim()) return
    const next = { ...draft, name: draft.name.trim(), bio: draft.bio.trim(), neighbourhood: draft.neighbourhood.trim() }
    if (!user || !account) { update({ ...data, profile: next }); setEditing(false); setSaved(true); return }
    setBusy(true); setSaveError('')
    try {
      const result = await api<SocialDetails>('/api/social/profile', { method: 'PUT', body: {
        interests: next.interests, bio: next.bio, neighbourhood: next.neighbourhood, social_style: next.social } })
      if (next.name !== user.name) setUser(await api<User>('/api/users/me', { method: 'PATCH', body: { name: next.name } }))
      setAccount(result); setEditing(false); setSaved(true)
      window.dispatchEvent(new Event('corkboard-profile-updated'))
    } catch (err) { setSaveError((err as Error).message) } finally { setBusy(false) }
  }
  return <div className="mx-auto max-w-5xl space-y-6">
    <header className="overflow-hidden rounded-3xl border border-line bg-surface shadow-sm">
      <div className="h-24 bg-brand-tint sm:h-32" aria-hidden="true" />
      <div className="relative px-5 pb-6 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4"><div className="-mt-10 grid size-24 place-items-center rounded-3xl border-4 border-surface bg-brand text-4xl font-extrabold text-on-brand shadow-sm" aria-hidden="true">{profile.name[0]?.toUpperCase()}</div><Button variant="secondary" onClick={edit}><Pencil size={16} /> Edit profile</Button></div>
        <div className="mt-4 flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-3xl font-extrabold tracking-tight">{profile.name}</h1><p className="mt-2 flex items-center gap-1.5 text-sm text-muted"><MapPin size={15} />{profile.neighbourhood || 'Calgary, AB'}</p></div><span className="inline-flex items-center gap-2 rounded-full bg-accent-soft px-3 py-2 text-sm font-bold text-accent-strong"><Coffee size={16} />{profile.social}</span></div>
        {profile.bio && <p className="mt-4 max-w-2xl whitespace-pre-wrap break-words leading-relaxed text-muted">{profile.bio}</p>}
        {user && <dl className="mt-5 grid max-w-md grid-cols-3 divide-x divide-line rounded-2xl border border-line">
          {([['followers', 'Followers', counts?.followers, 'connections'], ['following', 'Following', counts?.following, 'connections'], ['badges', 'Badges', badges?.earned, 'badges']] as const).map(([key, label, value, target]) =>
            <button key={key} type="button" onClick={() => setSection(target)} className="flex flex-col-reverse items-center py-3 transition first:rounded-l-2xl last:rounded-r-2xl hover:bg-surface-2">
              <dt className="flex items-center gap-1 text-xs font-bold text-muted">{key === 'badges' && <Award size={13} aria-hidden />}{label}</dt>
              <dd className="text-2xl font-extrabold tabular-nums">{value ?? '–'}</dd>
            </button>)}
        </dl>}
      </div>
    </header>
    <div role="status">{saved && <p className="flex items-center gap-2 text-sm text-success"><Check size={16} />{user && account ? 'Saved to your account.' : storageError ? 'Saved for this session only.' : 'Saved on this device.'}</p>}</div>{saveError && <p className="text-sm text-danger" role="alert">{saveError}</p>}
    <div className="flex gap-1 overflow-x-auto border-b border-line" role="group" aria-label="Profile sections">{sections.map(({ id, label, icon: Icon }) => <button type="button" key={id} aria-pressed={section === id} onClick={() => setSection(id)} className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-bold transition ${section === id ? 'border-brand text-brand-strong' : 'border-transparent text-muted hover:text-fg'}`}><Icon size={17} />{label}</button>)}</div>
    <div hidden={section !== 'badges'}>{section === 'badges' && <Badges />}</div>
    <div hidden={section !== 'events'}><MyEvents /></div>
    <div hidden={section !== 'saved'}>{section === 'saved' && <SavedEvents />}</div>
    <div hidden={section !== 'calendar'}><Calendar /></div>
    <div hidden={section !== 'connections'}><ConnectionsPanel /></div>
    <div hidden={section !== 'social'}><SocialLinks /></div>
    <div hidden={section !== 'buddy'}><BuddyPreferences /></div>
    <div hidden={section !== 'about'} className="space-y-6">
      <div className="grid items-start gap-6 lg:grid-cols-[1.5fr_1fr]">
        {editing ? <Card><h2 className="mb-5 text-xl font-extrabold">Edit profile</h2><form onSubmit={save} className="space-y-5"><div className="grid gap-4 sm:grid-cols-2"><Field label="Display name" required maxLength={60} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /><Field label="Neighbourhood" placeholder="Bridgeland" maxLength={80} value={draft.neighbourhood} onChange={e => setDraft({ ...draft, neighbourhood: e.target.value })} /></div><label className="block text-sm font-bold">Bio <span className="font-normal text-muted">· optional</span><textarea className="mt-2 block min-h-24 w-full rounded-xl border border-line bg-surface p-3 font-normal" maxLength={400} value={draft.bio} onChange={e => setDraft({ ...draft, bio: e.target.value })} placeholder="A little about you…" /></label><fieldset><legend className="mb-3 text-sm font-bold">Social style</legend><div className="flex flex-wrap gap-2">{['Quiet & small groups', 'A little of both', 'Lively & social'].map(s => <Button key={s} type="button" variant={draft.social === s ? 'primary' : 'secondary'} aria-pressed={draft.social === s} onClick={() => setDraft({ ...draft, social: s })}>{s}</Button>)}</div></fieldset><fieldset><legend className="mb-3 text-sm font-bold">Interests</legend><div className="grid grid-cols-2 gap-2">{interests.map((i, index) => { const Icon = interestIcons[index]; const active = draft.interests.includes(i); return <button key={i} type="button" aria-pressed={active} onClick={() => setDraft({ ...draft, interests: active ? draft.interests.filter(v => v !== i) : [...draft.interests, i] })} className={`flex items-center gap-2 rounded-xl border p-3 text-left text-sm font-bold ${active ? 'border-brand bg-brand-tint text-brand-strong' : 'border-line hover:bg-surface-2'}`}><Icon size={18} className="shrink-0" />{i}{active && <Check size={14} className="ml-auto shrink-0" />}</button> })}</div></fieldset><div className="flex gap-3 border-t border-line pt-4"><Button type="submit" loading={busy}>Save changes</Button><Button type="button" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button></div></form></Card> : <Card><div className="mb-5 flex items-center justify-between"><h2 className="text-lg font-extrabold">My interests</h2><button type="button" onClick={edit} aria-label="Edit interests" className="rounded-lg p-2 text-muted hover:bg-surface-2"><Pencil size={16} /></button></div>{profile.interests.length ? <div className="grid grid-cols-2 gap-3">{profile.interests.map(i => { const Icon = interestIcons[interests.indexOf(i)] ?? Heart; return <div key={i} className="flex items-center gap-3 rounded-2xl bg-surface-2 p-4"><Icon className="size-5 shrink-0 text-brand-strong" /><span className="text-sm font-bold">{i}</span></div> })}</div> : <div className="rounded-2xl border border-dashed border-line px-4 py-8 text-center"><Heart className="mx-auto mb-3 size-8 text-brand-strong" aria-hidden /><p className="mb-4 text-sm text-muted">What do you love doing?</p><Button variant="secondary" onClick={edit}>Add interests</Button></div>}{user && account && <Link to="/settings" className="mt-5 inline-flex items-center gap-1.5 text-xs font-bold text-muted hover:text-fg"><SettingsIcon size={13} aria-hidden />{account.discoverable ? 'Public profile' : 'Private profile'}</Link>}</Card>}
        <Card><div className="flex items-center justify-between"><h2 className="text-lg font-extrabold">Communities</h2><span className="rounded-full bg-brand-tint px-2.5 py-1 text-sm font-bold text-brand-strong">{joined.length}</span></div><div className="mt-4 space-y-2">{joined.map(g => <Link key={g.id} to={`/community?group=${g.id}`} className="flex items-center gap-3 rounded-xl p-3 hover:bg-surface-2"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-strong" aria-hidden>{(() => { const Icon = GROUP_ICONS[g.id] ?? Users; return <Icon size={18} /> })()}</span><span className="flex-1 text-sm font-bold">{g.name}</span><ArrowUpRight size={16} className="shrink-0 text-muted" /></Link>)}{!joined.length && <div className="py-6 text-center"><Users className="mx-auto mb-3 size-8 text-muted" aria-hidden /><p className="text-sm text-muted">Find your first community.</p></div>}</div><Link to="/community" className="mt-4 flex items-center justify-center gap-2 rounded-xl border border-line px-4 py-3 text-sm font-bold text-brand-strong hover:bg-surface-2">Explore communities <ArrowUpRight size={16} /></Link></Card>
      </div>
    </div>
  </div>
}
