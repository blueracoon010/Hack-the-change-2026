import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

export const interests = ['Walking & outdoors', 'Books', 'Art & culture', 'Music', 'Sports', 'Coffee & conversation']
export const groups = [
  { id: 'walk', name: 'Bow River Walking Club', interest: 'Walking & outdoors', icon: '☀', description: 'Fresh air, easy-paced walks, and a friendly hello. All paces welcome.', members: 48, vibe: 'Small groups · Outdoors', channels: ['introductions', 'weekend-walks', 'general'] },
  { id: 'books', name: 'One More Chapter', interest: 'Books', icon: '▤', description: 'A relaxed book circle. Come for the stories, stay for the conversation.', members: 32, vibe: 'Quiet & relaxed · Indoors', channels: ['introductions', 'what-we-are-reading', 'general'] },
  { id: 'art', name: 'Creative Calgary', interest: 'Art & culture', icon: '✦', description: 'Gallery visits, sketchbook afternoons, and trying something new together.', members: 65, vibe: 'Beginner friendly · Creative', channels: ['introductions', 'creative-corner', 'general'] },
  { id: 'coffee', name: 'New Here, Together', interest: 'Coffee & conversation', icon: '☕', description: 'New to Calgary or simply looking for a fresh start? Pull up a chair.', members: 54, vibe: 'Newcomers welcome · Casual', channels: ['introductions', 'coffee-plans', 'general'] },
]
export type Group = typeof groups[number]
export type LocalProfile = { name: string; bio: string; neighbourhood: string; social: string; interests: string[] }
export type Message = { id: string; group: string; channel: string; name: string; text: string; time: string }
export type CommunityState = { profile: LocalProfile; joined: string[]; messages: Message[] }

// Prototype data only. Namespace by signed-in account to avoid mixing local drafts.
export function useCommunityState() {
  const { user } = useAuth()
  const key = `corkboard-community-v1:${user?.id ?? 'development-guest'}`
  const initial = (): CommunityState => ({ profile: { name: user?.name ?? 'Calgary neighbour', bio: '', neighbourhood: '', social: 'A little of both', interests: [] }, joined: [], messages: [] })
  const [cache, setCache] = useState<{ key: string; data: CommunityState }>(() => ({ key, data: read() }))
  function read(): CommunityState {
    try {
      const raw = JSON.parse(localStorage.getItem(key) ?? 'null')
      if (raw && typeof raw.profile?.name === 'string' && typeof raw.profile?.bio === 'string' && typeof raw.profile?.neighbourhood === 'string' && typeof raw.profile?.social === 'string' && Array.isArray(raw.profile.interests) && raw.profile.interests.every((v: unknown) => typeof v === 'string') && Array.isArray(raw.joined) && raw.joined.every((v: unknown) => typeof v === 'string') && Array.isArray(raw.messages) && raw.messages.every((m: Message) => m && ['id', 'group', 'channel', 'name', 'text', 'time'].every(k => typeof m[k as keyof Message] === 'string'))) return raw
    } catch { /* Fall back when browser storage is unavailable or invalid. */ }
    return initial()
  }
  const data = cache.key === key ? cache.data : read()
  const [storageError, setStorageError] = useState(false)
  function update(next: CommunityState) {
    setCache({ key, data: next })
    try { localStorage.setItem(key, JSON.stringify(next)); setStorageError(false) } catch { setStorageError(true) }
  }
  return { data, update, storageError }
}
