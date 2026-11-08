// "Profile photo" field in Edit profile: change or remove your photo. Photos are cropped square and shrunk in the browser.
import { useRef, useState } from 'react'
import { Camera, Trash2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import { Button } from './ui'
import { avatarChanged, squarePhoto, useAvatar, UserAvatar } from './UserAvatar'

export function ProfilePhotoField({ name }: { name: string }) {
  const { user } = useAuth()
  const photo = useAvatar(user?.id)
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function pick(file?: File) {
    if (!file || !user) return
    setBusy(true); setError('')
    try {
      const data = await squarePhoto(file)
      await api('/api/users/me/avatar', { method: 'PUT', body: { photo: data } })
      avatarChanged(user.id, data)
    } catch (e) { setError((e as Error).message) } finally { setBusy(false); if (input.current) input.current.value = '' }
  }
  async function remove() {
    if (!user) return
    setBusy(true); setError('')
    try { await api('/api/users/me/avatar', { method: 'DELETE' }); avatarChanged(user.id, null) }
    catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <div>
      <p className="mb-2 text-sm font-bold">Profile photo</p>
      <div className="flex flex-wrap items-center gap-4">
        <UserAvatar id={user?.id} name={name} className={`size-16 text-xl ${busy ? 'opacity-50' : ''}`} />
        <Button type="button" variant="secondary" loading={busy} onClick={() => input.current?.click()}>
          <Camera size={16} aria-hidden />{photo ? 'Change photo' : 'Upload photo'}
        </Button>
        {photo && <Button type="button" variant="ghost" disabled={busy} onClick={remove}><Trash2 size={16} aria-hidden />Remove</Button>}
        <input ref={input} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => pick(e.target.files?.[0])} />
      </div>
      <p className="mt-2 text-xs text-muted">Shown on your profile, in chats and to friends. Square photos look best.</p>
      {error && <p role="alert" className="mt-1 text-sm text-danger">{error}</p>}
    </div>
  )
}
