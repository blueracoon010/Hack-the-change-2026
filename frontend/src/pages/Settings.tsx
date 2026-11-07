import { useState } from 'react'
import { Download, Trash2 } from 'lucide-react'
import { Alert, Button, Card, Field, PageHeader, Segmented, Switch } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { usePrefs } from '../context/PreferencesContext'
import { api } from '../lib/api'
import type { User } from '../lib/types'

export default function Settings() {
  const { user, setUser, logout } = useAuth()
  const { prefs, update } = usePrefs()
  const [name, setName] = useState(user?.name ?? '')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function saveProfile() {
    setSaving(true); setError(null); setMessage(null)
    try {
      setUser(await api<User>('/api/users/me', { method: 'PATCH', body: { name } }))
      setMessage('Profile saved.')
    } catch (e) { setError((e as Error).message) } finally { setSaving(false) }
  }

  async function exportData() {
    try {
      const data = await api<unknown>('/api/users/me/export')
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
      const a = Object.assign(document.createElement('a'), { href: url, download: 'my-data.json' })
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) { setError((e as Error).message) }
  }

  async function deleteAccount() {
    try { await api('/api/users/me', { method: 'DELETE' }); logout() } catch (e) { setError((e as Error).message) }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Settings" subtitle="Your profile, display and privacy controls." />
      <div aria-live="polite">{message && <p className="rounded-xl bg-accent-soft px-4 py-3 font-bold text-[#05634f]">{message}</p>}</div>
      {error && <Alert>{error}</Alert>}

      <Card aria-labelledby="profile-h">
        <h2 id="profile-h" className="mb-4 text-lg font-extrabold">Profile</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          <Field label="Email" value={user?.email ?? ''} disabled hint="Email can't be changed yet." />
        </div>
        <Button className="mt-4" onClick={saveProfile} loading={saving} disabled={!name.trim() || name === user?.name}>Save changes</Button>
      </Card>

      <Card aria-labelledby="a11y-h">
        <h2 id="a11y-h" className="mb-2 text-lg font-extrabold">Display & accessibility</h2>
        <p className="mb-2 text-sm text-muted">Saved on this device only.</p>
        <div className="divide-y divide-line">
          <div className="flex flex-wrap items-center justify-between gap-3 py-3">
            <p className="font-bold">Theme</p>
            <Segmented label="Theme" value={prefs.theme} onChange={(theme) => update({ theme })}
              options={[{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 py-3">
            <p className="font-bold">Text size</p>
            <Segmented label="Text size" value={prefs.textSize} onChange={(textSize) => update({ textSize })}
              options={[{ value: 'md', label: 'Default' }, { value: 'lg', label: 'Large' }, { value: 'xl', label: 'Extra large' }]} />
          </div>
          <Switch label="High contrast" description="Stronger text and borders." checked={prefs.highContrast} onChange={(highContrast) => update({ highContrast })} />
          <Switch label="Reduce motion" description="Turn off animations and transitions." checked={prefs.reduceMotion} onChange={(reduceMotion) => update({ reduceMotion })} />
        </div>
      </Card>

      <Card aria-labelledby="privacy-h">
        <h2 id="privacy-h" className="mb-2 text-lg font-extrabold">Privacy & your data</h2>
        <p className="text-muted">We store only your <strong className="text-fg">name</strong>, <strong className="text-fg">email</strong>, a <strong className="text-fg">bcrypt-hashed password</strong> and your sign-up date. Energy and community data come from public sources and are not linked to you. No tracking or analytics.</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button variant="secondary" onClick={exportData}><Download className="size-4" aria-hidden /> Export my data</Button>
          {!confirmDelete ? (
            <Button variant="danger" onClick={() => setConfirmDelete(true)}><Trash2 className="size-4" aria-hidden /> Delete my account</Button>
          ) : (
            <div role="alertdialog" aria-label="Confirm account deletion" className="flex flex-wrap items-center gap-3 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3">
              <p className="font-bold text-danger">This permanently deletes your account. Continue?</p>
              <Button variant="danger" onClick={deleteAccount} autoFocus>Yes, delete</Button>
              <Button variant="ghost" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
