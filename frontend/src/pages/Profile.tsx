import { useState } from 'react'
import { Link } from 'react-router-dom'
import { MapPin, Users, Check, Pencil } from 'lucide-react'
import { Button, Card, Field, PageHeader } from '../components/ui'
import { groups, interests, useCommunityState } from '../lib/community'
import { ConnectionsPanel } from '../components/ConnectionsPanel'
import { SocialLinks } from '../components/SocialLinks'

export default function Profile() {
  const { data, update, storageError } = useCommunityState()
  const [draft, setDraft] = useState(data.profile)
  const [editing, setEditing] = useState(false)
  const [saved, setSaved] = useState(false)
  const joined = groups.filter(g => data.joined.includes(g.id))
  function save(e: React.FormEvent) {
    e.preventDefault()
    if (!draft.name.trim()) return
    update({ ...data, profile: { ...draft, name: draft.name.trim(), bio: draft.bio.trim(), neighbourhood: draft.neighbourhood.trim() } })
    setEditing(false); setSaved(true)
  }
  return <div className="space-y-6">
    <PageHeader title="Your corner of the community" subtitle="A little about you. A starting point for connection." actions={!editing && <Button variant="secondary" onClick={() => { setDraft(data.profile); setEditing(true); setSaved(false) }}><Pencil size={16} /> Edit profile</Button>} />
    <p className="text-sm text-muted">Prototype · profile and memberships are stored in this browser only. This profile is not published to other people.</p>
    <div role="status">{saved && <p className="text-success">{storageError ? 'Updated for this session. Browser storage is unavailable.' : 'Profile saved on this device.'}</p>}</div>
    <ConnectionsPanel />
    <SocialLinks />
    <div className="grid gap-6 lg:grid-cols-[1fr_1.5fr]">
      <div className="space-y-6"><Card><div className="mb-5 grid size-20 place-items-center rounded-3xl bg-brand-tint text-3xl font-extrabold text-brand-strong" aria-hidden>{data.profile.name[0]?.toUpperCase()}</div><h2 className="text-2xl font-extrabold">{data.profile.name}</h2><p className="mt-2 flex items-center gap-2 text-muted"><MapPin size={16} /> {data.profile.neighbourhood || 'Calgary · neighbourhood not set'}</p><p className="mt-5 leading-relaxed text-muted">{data.profile.bio || 'What brings you joy? Add a short introduction when you feel ready.'}</p><div className="mt-5 rounded-xl bg-surface-2 p-4"><p className="text-sm font-bold text-muted">My social style</p><p className="mt-1 font-bold">{data.profile.social}</p></div></Card>
      <Card><h2 className="font-extrabold">My communities</h2><p className="mt-1 text-sm text-muted">{joined.length} joined in this prototype</p><div className="mt-4 space-y-3">{joined.map(g => <Link key={g.id} to={`/community?group=${g.id}`} className="flex items-center gap-3 rounded-xl border border-line p-3 hover:bg-surface-2"><span aria-hidden>{g.icon}</span><span className="font-bold">{g.name}</span></Link>)}{joined.length === 0 && <p className="text-muted">Find people who enjoy the things you do.</p>}</div><Link to="/community" className="mt-5 inline-flex items-center gap-2 font-bold text-brand-strong"><Users size={16} /> Explore communities</Link></Card></div>
      {editing ? <Card><h2 className="mb-5 text-xl font-extrabold">Make yourself at home</h2><form onSubmit={save} className="space-y-5"><Field label="Display name" required maxLength={60} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /><Field label="Neighbourhood (optional)" placeholder="For example, Bridgeland" maxLength={80} value={draft.neighbourhood} onChange={e => setDraft({ ...draft, neighbourhood: e.target.value })} /><label className="block font-bold">About me (optional)<textarea className="mt-2 block min-h-28 w-full rounded-xl border border-line bg-surface p-3 font-normal" maxLength={400} value={draft.bio} onChange={e => setDraft({ ...draft, bio: e.target.value })} placeholder="A few things you enjoy, or what you hope to find here…" /></label><fieldset><legend className="mb-2 font-bold">What feels comfortable?</legend><p className="mb-3 text-sm text-muted">A preference, not a permanent label. Change it anytime.</p><div className="flex flex-wrap gap-2">{['Quiet & small groups', 'A little of both', 'Lively & social'].map(s => <Button key={s} type="button" variant={draft.social === s ? 'primary' : 'secondary'} aria-pressed={draft.social === s} onClick={() => setDraft({ ...draft, social: s })}>{s}</Button>)}</div></fieldset><fieldset><legend className="mb-3 font-bold">Your interests</legend><div className="flex flex-wrap gap-2">{interests.map(i => <Button key={i} type="button" variant={draft.interests.includes(i) ? 'primary' : 'secondary'} aria-pressed={draft.interests.includes(i)} onClick={() => setDraft({ ...draft, interests: draft.interests.includes(i) ? draft.interests.filter(v => v !== i) : [...draft.interests, i] })}>{draft.interests.includes(i) && <Check size={14} />}{i}</Button>)}</div></fieldset><div className="flex gap-3"><Button type="submit">Save profile</Button><Button type="button" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button></div></form></Card> : <Card><p className="text-sm font-bold uppercase tracking-widest text-brand-strong">Things that bring me joy</p><h2 className="mt-2 text-xl font-extrabold">Connection starts with something in common.</h2><div className="my-6 flex flex-wrap gap-3">{data.profile.interests.map(i => <span key={i} className="rounded-full bg-brand-tint px-4 py-2 font-bold text-brand-strong">{i}</span>)}{data.profile.interests.length === 0 && <p className="text-muted">Add interests to help you find your people.</p>}</div><Button variant="secondary" onClick={() => { setDraft(data.profile); setEditing(true); setSaved(false) }}>Choose your interests</Button><div className="mt-10 border-t border-line pt-6"><h3 className="font-bold">Go at your own pace</h3><p className="mt-2 leading-relaxed text-muted">You can join a group, say a quick hello, or just look around. There’s no right way to start.</p></div></Card>}
    </div>
  </div>
}
