// Profile photos: shown wherever a person's avatar appears, falling back to their initial on the profile pink.
// Photos are fetched once per person and cached; uploading a new one updates every avatar on screen.
import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { cx } from './ui'

const cache = new Map<number, string | null>()
const pending = new Map<number, Promise<string | null>>()
const EVENT = 'nexus-avatar-updated'
const initialsOf = (name: string) => name.trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?'

function load(id: number): Promise<string | null> {
  if (cache.has(id)) return Promise.resolve(cache.get(id)!)
  if (!pending.has(id)) {
    pending.set(id, api<{ photo: string | null }>(`/api/users/${id}/avatar`)
      .then((r) => { cache.set(id, r.photo); return r.photo })
      .catch(() => null)
      .finally(() => pending.delete(id)))
  }
  return pending.get(id)!
}

/** Tell every avatar on screen that this person's photo changed. */
export function avatarChanged(id: number, photo: string | null) {
  cache.set(id, photo)
  window.dispatchEvent(new CustomEvent(EVENT, { detail: id }))
}

export function useAvatar(id: number | undefined) {
  const [photo, setPhoto] = useState<string | null>(id !== undefined ? cache.get(id) ?? null : null)
  useEffect(() => {
    if (id === undefined) return
    let active = true
    load(id).then((p) => { if (active) setPhoto(p) })
    const onChange = (e: Event) => { if ((e as CustomEvent).detail === id) setPhoto(cache.get(id) ?? null) }
    window.addEventListener(EVENT, onChange)
    return () => { active = false; window.removeEventListener(EVENT, onChange) }
  }, [id])
  return photo
}

export function UserAvatar({ id, name, className, fallback = 'bg-pink text-navy' }: { id?: number; name: string; className?: string; fallback?: string }) {
  const photo = useAvatar(id)
  return photo
    ? <img src={photo} alt="" aria-hidden className={cx('shrink-0 rounded-full object-cover', className)} />
    : <span className={cx('grid shrink-0 place-items-center rounded-full font-semibold', fallback, className)} aria-hidden>{initialsOf(name)}</span>
}

/** Read a photo file, centre-crop it to a square and shrink it (JPEG, 512px) before upload. */
export function squarePhoto(file: File, size = 512): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const side = Math.min(img.width, img.height)
      const canvas = Object.assign(document.createElement('canvas'), { width: Math.min(size, side), height: Math.min(size, side) })
      canvas.getContext('2d')!.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', 0.85))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file isn’t a photo we can read.')) }
    img.src = url
  })
}
