import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { api } from './api'

export const interests = ['Walking & outdoors', 'Books', 'Art & culture', 'Music', 'Sports', 'Coffee & conversation']
export const groups = [
  { id: 'walk', name: 'Bow River Walking Club', interest: 'Walking & outdoors', icon: 'walk', description: 'Fresh air, easy-paced walks, and a friendly hello. All paces welcome.', members: 48, vibe: 'Small groups · Outdoors', channels: ['introductions', 'weekend-walks', 'general'] },
  { id: 'books', name: 'One More Chapter', interest: 'Books', icon: 'books', description: 'A relaxed book circle. Come for the stories, stay for the conversation.', members: 32, vibe: 'Quiet & relaxed · Indoors', channels: ['introductions', 'what-we-are-reading', 'general'] },
  { id: 'art', name: 'Creative Calgary', interest: 'Art & culture', icon: 'art', description: 'Gallery visits, sketchbook afternoons, and trying something new together.', members: 65, vibe: 'Beginner friendly · Creative', channels: ['introductions', 'creative-corner', 'general'] },
  { id: 'coffee', name: 'New Here, Together', interest: 'Coffee & conversation', icon: 'coffee', description: 'New to Calgary or simply looking for a fresh start? Pull up a chair.', members: 54, vibe: 'Newcomers welcome · Casual', channels: ['introductions', 'coffee-plans', 'general'] },
]
/** A community: one of the built-ins above, or one someone created (custom: true, details from the server). */
export type Group = {
  id: string; name: string; interest: string; icon: string; description: string; channels: string[]
  vibe?: string; members?: number; custom?: boolean; visibility?: 'public' | 'private'; mine?: boolean; owner?: string
}
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

/** Group membership + real member counts from the shared database (GET /api/community/groups). */
export type GroupState = { id: string; members: number; joined: boolean } & Partial<Omit<Group, 'members'>>
export type Relation = 'me' | 'friend' | 'following' | 'requested' | 'follows-you' | 'none'
export type ChatMessage = { id: number; user_id: number; name: string; text: string; time: string; mine: boolean; relation?: Relation }

export function useCommunityGroups() {
  const [state, setState] = useState<Record<string, GroupState>>({})
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const reload = useCallback(async () => {
    try {
      const rows = await api<GroupState[]>('/api/community/groups')
      setState(Object.fromEntries(rows.map(r => [r.id, r]))); setError('')
    } catch (e) { setError((e as Error).message) } finally { setLoaded(true) }
  }, [])
  useEffect(() => { void reload() }, [reload])
  async function setMembership(id: string, join: boolean) {
    await api(`/api/community/groups/${id}/membership`, { method: join ? 'PUT' : 'DELETE' })
    await reload()
  }
  const joined = Object.values(state).filter(g => g.joined).map(g => g.id)
  // Built-ins first, then communities people created (newest first, as the server sends them).
  const all: Group[] = [
    ...(groups as Group[]),
    ...Object.values(state).filter(g => g.custom).map(g => ({
      id: g.id, name: g.name ?? 'Community', interest: g.interest ?? '', icon: g.icon ?? 'users', description: g.description ?? '',
      channels: g.channels ?? ['general'], custom: true, visibility: g.visibility, mine: g.mine, owner: g.owner,
    })),
  ]
  return { state, joined, all, loaded, error, reload, setMembership }
}
