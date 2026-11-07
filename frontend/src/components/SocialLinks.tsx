import { useEffect, useState } from 'react'
import { Link2, Share2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import { interests } from '../lib/community'
import { Button, Card, Field, Switch } from './ui'

export type SocialDetails = { instagram: string; interests: string[]; discoverable: boolean; invite_token?: string | null }
const empty: SocialDetails = { instagram: '', interests: [], discoverable: false }
export const socialDemoKey = 'corkboard-social-demo-v1'
export function readSocialDemo(): SocialDetails {
  try { const value = JSON.parse(localStorage.getItem(socialDemoKey) ?? 'null'); if (value && typeof value.instagram === 'string' && typeof value.discoverable === 'boolean' && Array.isArray(value.interests)) return { ...value, interests: value.interests.filter((i: unknown) => interests.includes(i as string)) } } catch { /* Storage unavailable */ }
  return empty
}
export function SocialLinks() {
  const { user, ready } = useAuth()
  const [details, setDetails] = useState<SocialDetails>(empty)
  const [saved, setSaved] = useState<SocialDetails>(empty)
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true
    setLoaded(false); setError(''); setNotice('')
    if (!ready) return
    const request = user ? api<SocialDetails>('/api/social/profile') : Promise.resolve(readSocialDemo())
    request.then(result => { if (active) { setDetails(result); setSaved(result); setLoaded(true) } }).catch(e => { if (active) setError(e.message) })
    return () => { active = false }
  }, [user?.id, ready, retry])
  const handle = details.instagram.trim().replace(/^@/, '').toLowerCase()
  const valid = !handle || (handle.length <= 30 && /^[a-z0-9_](?:[a-z0-9._]{0,28}[a-z0-9_])?$/.test(handle) && !handle.includes('..'))
  const invite = saved.discoverable && saved.invite_token ? `${window.location.href.split('#')[0]}#/invite/${encodeURIComponent(saved.invite_token)}` : ''
  async function save(e: React.FormEvent) {
    e.preventDefault(); if (!valid) return
    setBusy(true); setError(''); setNotice('')
    try {
      const next = { instagram: handle, interests: details.interests, discoverable: details.discoverable }
      const result = user ? await api<SocialDetails>('/api/social/profile', { method: 'PUT', body: next }) : next
      if (!user) localStorage.setItem(socialDemoKey, JSON.stringify(result))
      setSaved(result); setDetails(result); setNotice(user ? 'Social preferences saved.' : 'Demo preferences saved on this device.')
      window.dispatchEvent(new Event('corkboard-social-updated'))
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(invite); setNotice('Invite link copied. Share it wherever you like.') } catch { setNotice('Select and copy the invitation link below.') }
  }
  return <Card><h2 className="flex items-center gap-2 text-xl font-extrabold"><Link2 size={20} /> Connect beyond Corkboard</h2><p className="mt-2 text-sm text-muted">Add an optional Instagram link and choose interests for people suggestions. Handles are self-reported, not verified. No Instagram followers are imported.</p>{loaded ? <form onSubmit={save} className="mt-5 space-y-5"><Field label="Instagram username (optional)" placeholder="your_username" value={details.instagram} maxLength={31} onChange={e => setDetails({ ...details, instagram: e.target.value })} error={!valid ? 'Enter a username, not a URL.' : undefined} /><Switch label="Enable social discovery" description="Share your selected interests and Instagram link for suggestions. Also enable an invite link that shows your account name and Instagram link to anyone who has it." checked={details.discoverable} onChange={discoverable => setDetails({ ...details, discoverable })} /><fieldset><legend className="mb-2 font-bold">Interests to share for suggestions</legend><p className="mb-3 text-sm text-muted">These are separate from your private prototype profile interests.</p><div className="flex flex-wrap gap-2">{interests.map(i => <Button key={i} type="button" variant={details.interests.includes(i) ? 'primary' : 'secondary'} aria-pressed={details.interests.includes(i)} onClick={() => setDetails({ ...details, interests: details.interests.includes(i) ? details.interests.filter(v => v !== i) : [...details.interests, i] })}>{i}</Button>)}</div></fieldset><Button type="submit" loading={busy} disabled={!valid}>Save social preferences</Button></form> : !error && <p className="mt-4" role="status">Loading social preferences…</p>}
    {saved.discoverable && saved.instagram && valid && <a href={`https://www.instagram.com/${encodeURIComponent(saved.instagram)}/`} target="_blank" rel="noreferrer" className="mt-5 inline-block font-bold text-brand-strong">View @{saved.instagram} on Instagram ↗</a>}
    <div className="mt-6 border-t border-line pt-5"><h3 className="flex items-center gap-2 font-bold"><Share2 size={18} /> Invite a friend</h3>{invite ? <><p className="my-2 text-sm text-muted">Valid for 30 days from generation. Turning discovery off disables the link. Friends choose whether to follow you.</p><label className="block text-sm font-bold">Your invitation link<input readOnly value={invite} onFocus={e => e.target.select()} className="my-3 block w-full rounded-xl border border-line bg-surface p-3 text-sm font-normal" /></label><Button type="button" variant="secondary" onClick={copy}>Copy invite link</Button>{window.location.hostname === 'localhost' && <p className="mt-2 text-sm text-muted">This localhost link works on your computer only. Sharing across devices needs a hosted app.</p>}</> : <p className="mt-2 text-sm text-muted">{!user ? 'Sign in to create a real invitation link. Guest demo changes do not publish a profile.' : 'Enable discovery and save your preferences to create an invitation link.'}</p>}</div>
    <p role="status" className="mt-3 text-sm text-success">{notice}</p>{error && <div role="alert" className="mt-3 text-sm text-danger">{error}{!loaded && <Button variant="secondary" onClick={() => setRetry(v => v + 1)}>Retry</Button>}</div>}
  </Card>
}

