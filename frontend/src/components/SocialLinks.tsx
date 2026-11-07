// Profile > Social & invites. Two separate things:
//  * InstagramCard: your handle and whether it's shown on your profile (its own switch; public/private is on "About me").
//  * InviteFriend: a short code + link. Whoever uses it becomes your friend (you follow each other) in one tap.
import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Camera, Check, Copy, Link2, Mail, MessageCircle, RefreshCw, Share2, UserPlus } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import { interests } from '../lib/community'
import { APP, APP_URL } from '../config/app'
import { Button, Card, Field, Switch } from './ui'

export type SocialDetails = {
  instagram: string; show_instagram?: boolean; interests: string[]; discoverable: boolean
  bio?: string; neighbourhood?: string; social_style?: string
}
const empty: SocialDetails = { instagram: '', show_instagram: true, interests: [], discoverable: false }
export const socialDemoKey = 'corkboard-social-demo-v1'
/** Signed-out demo only (Connections panel preview). */
export function readSocialDemo(): SocialDetails {
  try { const value = JSON.parse(localStorage.getItem(socialDemoKey) ?? 'null'); if (value && typeof value.instagram === 'string' && typeof value.discoverable === 'boolean' && Array.isArray(value.interests)) return { ...value, interests: value.interests.filter((i: unknown) => interests.includes(i as string)) } } catch { /* Storage unavailable */ }
  return empty
}

export function SocialLinks() {
  return <div className="grid items-start gap-6 lg:grid-cols-2"><InviteFriend /><InstagramCard /></div>
}

function InstagramCard() {
  const { user } = useAuth()
  const [saved, setSaved] = useState<SocialDetails | null>(null)
  const [handle, setHandle] = useState('')
  const [show, setShow] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    if (!user) return
    let active = true
    setError('')
    api<SocialDetails>('/api/social/profile').then(r => {
      if (!active) return
      setSaved(r); setHandle(r.instagram ? `@${r.instagram}` : ''); setShow(r.show_instagram ?? true)
    }).catch(e => { if (active) setError(e.message) })
    return () => { active = false }
  }, [user?.id, retry])
  useEffect(() => {  // the About me page changes public/private: refresh the hint below
    const refresh = () => setRetry(v => v + 1)
    window.addEventListener('corkboard-profile-updated', refresh)
    return () => window.removeEventListener('corkboard-profile-updated', refresh)
  }, [])

  const clean = handle.trim().replace(/^@/, '').toLowerCase()
  const valid = !clean || (clean.length <= 30 && /^[a-z0-9_](?:[a-z0-9._]{0,28}[a-z0-9_])?$/.test(clean) && !clean.includes('..'))

  async function save(e: FormEvent) {
    e.preventDefault(); if (!valid) return
    setBusy(true); setError(''); setNotice('')
    try {
      const r = await api<SocialDetails>('/api/social/profile', { method: 'PUT', body: { instagram: clean, show_instagram: show } })
      setSaved(r); setHandle(r.instagram ? `@${r.instagram}` : ''); setNotice('Instagram saved.')
      window.dispatchEvent(new Event('corkboard-social-updated'))
    } catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  }

  const status = !saved?.instagram ? null
    : !saved.show_instagram ? 'Hidden: only you can see it.'
    : saved.discoverable ? 'Shown on your public profile and invite page.'
    : 'Your profile is private, so it’s hidden for now. Make your profile public under About me to show it.'

  return (
    <Card>
      <h2 className="flex items-center gap-2 text-xl font-extrabold"><Camera size={20} aria-hidden /> Instagram</h2>
      <p className="mt-2 text-sm text-muted">Optional. Separate from whether your profile is public.</p>
      {saved ? (
        <form onSubmit={save} className="mt-5 space-y-3">
          <Field label="Instagram username" placeholder="@your_username" value={handle} maxLength={31}
            onChange={e => setHandle(e.target.value)} error={!valid ? 'Enter a username, not a link.' : undefined} />
          <Switch label="Show Instagram on my profile" description="Turn off to keep it saved but hidden from everyone." checked={show} onChange={setShow} />
          <Button type="submit" loading={busy} disabled={!valid}>Save Instagram</Button>
          {status && <p className="flex items-start gap-1.5 text-sm text-muted"><Check size={15} className="mt-0.5 shrink-0" aria-hidden />{status}</p>}
          {saved.instagram && <a href={`https://www.instagram.com/${encodeURIComponent(saved.instagram)}/`} target="_blank" rel="noreferrer" className="inline-block text-sm font-bold text-brand-strong">View @{saved.instagram} on Instagram ↗</a>}
          <p className="text-xs text-muted">Usernames aren’t verified. Followers aren’t imported.</p>
        </form>
      ) : !error && <p className="mt-4" role="status">Loading…</p>}
      <p role="status" className="mt-2 text-sm text-success">{notice}</p>
      {error && <div role="alert" className="mt-2 text-sm text-danger">{error} <button type="button" className="font-bold underline" onClick={() => setRetry(v => v + 1)}>Retry</button></div>}
    </Card>
  )
}

type Invite = { code: string; expires_at: string }

export function InviteFriend() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [invite, setInvite] = useState<Invite | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [theirCode, setTheirCode] = useState('')

  useEffect(() => {
    if (!user) return
    api<Invite>('/api/social/invites/mine').then(setInvite).catch(e => setError(e.message))
  }, [user?.id])

  const pretty = invite ? `${invite.code.slice(0, 4)}-${invite.code.slice(4)}` : ''
  const link = invite ? `${APP_URL.split('#')[0]}#/invite/${invite.code}` : ''
  const message = invite ? `Join me on ${APP.name}, a map of what's on around Calgary! Open ${link} or enter my invite code ${pretty} under Profile → Social & invites.` : ''
  const expires = invite ? new Date(invite.expires_at).toLocaleDateString('en-CA', { month: 'long', day: 'numeric' }) : ''

  async function copy(text: string, what: string) {
    try { await navigator.clipboard.writeText(text); setNotice(`${what} copied.`) } catch { setNotice('Select the text and copy it.') }
  }
  async function share() {
    try { await navigator.share({ title: `Join me on ${APP.name}`, text: message, url: link }) } catch { /* cancelled */ }
  }
  async function renew() {
    setBusy(true); setNotice('')
    try { setInvite(await api<Invite>('/api/social/invites/new', { method: 'POST' })); setNotice('New code made. The old one no longer works.') }
    catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  function submitCode(e: FormEvent) {
    e.preventDefault()
    const code = theirCode.trim().replace(/^.*#\/invite\//, '').replace(/[\s-]/g, '').toUpperCase()
    if (code) navigate(`/invite/${encodeURIComponent(code)}`)
  }

  return (
    <Card>
      <h2 className="flex items-center gap-2 text-xl font-extrabold"><UserPlus size={20} aria-hidden /> Invite a friend</h2>
      <p className="mt-2 text-sm text-muted">Share your code or link. When a friend uses it, you’ll follow each other, so you can see each other’s plans.</p>
      {invite ? (
        <div className="mt-5 space-y-4">
          <div className="rounded-2xl bg-brand-tint p-4 text-center">
            <p className="text-xs font-bold uppercase tracking-widest text-brand-strong">Your invite code</p>
            <p className="mt-1 font-mono text-3xl font-extrabold tracking-[0.2em] text-brand-strong" aria-label={`Invite code ${invite.code.split('').join(' ')}`}>{pretty}</p>
            <p className="mt-1 text-xs text-brand-strong/80">Works until {expires}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => copy(link, 'Invite link')}><Link2 size={16} aria-hidden /> Copy link</Button>
            <Button type="button" variant="secondary" onClick={() => copy(pretty, 'Code')}><Copy size={16} aria-hidden /> Copy code</Button>
            {'share' in navigator && <Button type="button" variant="secondary" onClick={share}><Share2 size={16} aria-hidden /> Share…</Button>}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm font-bold">
            <a className="inline-flex items-center gap-1.5 text-brand-strong hover:underline" href={`mailto:?subject=${encodeURIComponent(`Join me on ${APP.name}`)}&body=${encodeURIComponent(message)}`}><Mail size={15} aria-hidden /> Email</a>
            <a className="inline-flex items-center gap-1.5 text-brand-strong hover:underline" href={`sms:?&body=${encodeURIComponent(message)}`}><MessageCircle size={15} aria-hidden /> Text message</a>
            <a className="inline-flex items-center gap-1.5 text-brand-strong hover:underline" href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer"><MessageCircle size={15} aria-hidden /> WhatsApp</a>
          </div>
          <details className="text-sm">
            <summary className="cursor-pointer font-bold text-muted">Show link</summary>
            <input readOnly value={link} onFocus={e => e.target.select()} aria-label="Your invite link" className="mt-2 block w-full rounded-xl border border-line bg-surface p-3 text-sm" />
            {link.includes('localhost') && <p className="mt-1 text-xs text-muted">This link opens the app running on your friend’s own computer, so it works for teammates running Nexus locally. Anyone can use the code.</p>}
          </details>
          <button type="button" onClick={renew} disabled={busy} className="inline-flex items-center gap-1.5 text-sm font-bold text-muted hover:text-fg disabled:opacity-50">
            <RefreshCw size={14} aria-hidden /> Make a new code (switches off this one)
          </button>
        </div>
      ) : !error && <p className="mt-4" role="status">Loading your invite…</p>}

      <form onSubmit={submitCode} className="mt-6 border-t border-line pt-5">
        <label htmlFor="their-code" className="font-bold">Got a code from a friend?</label>
        <div className="mt-2 flex gap-2">
          <input id="their-code" value={theirCode} onChange={e => setTheirCode(e.target.value)} placeholder="ABCD-2345" autoComplete="off"
            className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-2.5 font-mono uppercase tracking-widest" />
          <Button type="submit" variant="secondary" disabled={!theirCode.trim()}>Use code</Button>
        </div>
      </form>
      <p role="status" className="mt-3 text-sm text-success">{notice}</p>
      {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
    </Card>
  )
}
