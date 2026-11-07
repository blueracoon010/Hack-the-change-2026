import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Hash, MessageCircle, Search, Send, Users } from 'lucide-react'
import { Button, Card, Field, PageHeader } from '../components/ui'
import { groups, interests, useCommunityGroups, type ChatMessage } from '../lib/community'
import { api } from '../lib/api'

export default function Community() {
  // Memberships, member counts and messages come from the shared database, so everyone sees the same thing.
  const { state, joined: joinedIds, error: groupsError, setMembership } = useCommunityGroups()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [chatError, setChatError] = useState('')
  const [sending, setSending] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const [interest, setInterest] = useState('All interests')
  const [mine, setMine] = useState(false)
  const [channel, setChannel] = useState('introductions')
  const [text, setText] = useState('')
  const [notice, setNotice] = useState('')
  const selected = groups.find(g => g.id === params.get('group'))
  const joined = !!selected && joinedIds.includes(selected.id)
  // Load the channel, then check for new messages every 15 s while it's open.
  useEffect(() => {
    if (!selected) return
    let active = true
    const load = () => api<ChatMessage[]>(`/api/community/groups/${selected.id}/channels/${channel}/messages`)
      .then(m => { if (active) { setMessages(m); setChatError('') } }).catch(e => { if (active) setChatError(e.message) })
    load()
    const timer = setInterval(load, 15_000)
    return () => { active = false; clearInterval(timer) }
  }, [selected?.id, channel, refresh])
  const visible = groups.filter(g => (!mine || joinedIds.includes(g.id)) && (interest === 'All interests' || g.interest === interest) && `${g.name} ${g.description}`.toLowerCase().includes(query.toLowerCase()))
  function selectGroup(id: string) { setParams({ group: id }); setChannel('introductions'); setText(''); setNotice(''); setMessages([]) }
  async function toggleMembership(id: string) {
    const leaving = joinedIds.includes(id)
    try {
      await setMembership(id, !leaving)
      setNotice(leaving ? 'You left this community.' : 'You joined! Choose a channel to say hello.')
    } catch (e) { setNotice((e as Error).message) }
  }
  async function send(e: React.FormEvent) {
    e.preventDefault()
    if (!selected || !joined || !text.trim() || sending) return
    setSending(true)
    try {
      const m = await api<ChatMessage>(`/api/community/groups/${selected.id}/channels/${channel}/messages`, { method: 'POST', body: { text: text.trim() } })
      setMessages(prev => [...prev, m]); setText(''); setNotice('Posted. Everyone in the community can see it.')
    } catch (err) { setNotice((err as Error).message) } finally { setSending(false) }
  }
  async function removeMessage(id: number) {
    try { await api(`/api/community/messages/${id}`, { method: 'DELETE' }); setMessages(prev => prev.filter(m => m.id !== id)) }
    catch (err) { setNotice((err as Error).message) }
  }
  return <div className="space-y-6">
    <PageHeader title="Find your people" subtitle="Shared interests. Familiar faces. A place to belong." />
    <div className="rounded-2xl bg-brand-tint p-5 text-brand-strong"><p className="font-extrabold">A small hello can be a good beginning.</p><p className="mt-1 text-sm">Explore a community that feels like you.</p></div>
    <div className="grid gap-6 xl:grid-cols-[1fr_1.1fr]">
      <section aria-label="Find communities" className="space-y-4"><div className="flex items-center gap-2"><Search size={20} aria-hidden /><Field className="flex-1" label="Search communities" placeholder="Try books, walking, or coffee" value={query} onChange={e => setQuery(e.target.value)} /></div><div className="flex flex-wrap items-end gap-3"><label className="flex-1 text-sm font-bold">Interest<select value={interest} onChange={e => setInterest(e.target.value)} className="mt-2 block w-full rounded-xl border border-line bg-surface px-3 py-3 text-fg">{['All interests', ...interests].map(i => <option key={i}>{i}</option>)}</select></label><Button variant={mine ? 'primary' : 'secondary'} aria-pressed={mine} onClick={() => setMine(!mine)}>My communities ({joinedIds.length})</Button></div><p className="text-sm text-muted" aria-live="polite">{visible.length} communities</p>
      {visible.map(g => <Card key={g.id} className={selected?.id === g.id ? 'border-brand' : ''}><div className="flex items-start gap-4"><span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-brand-tint text-2xl text-brand-strong" aria-hidden>{g.icon}</span><div><p className="text-xs font-bold uppercase tracking-wider text-muted">{g.interest}</p><h2 className="mt-1 text-lg font-extrabold">{g.name}</h2></div></div><p className="my-4 leading-relaxed text-muted">{g.description}</p><p className="text-sm text-muted">{g.vibe}</p><div className="mt-5 flex flex-wrap items-center justify-between gap-3"><span className="flex items-center gap-2 text-sm text-muted"><Users size={16} />{state[g.id] ? `${state[g.id].members} ${state[g.id].members === 1 ? 'member' : 'members'}` : '…'}</span><Button variant="secondary" onClick={() => selectGroup(g.id)}>{joinedIds.includes(g.id) ? 'Open channels' : 'Explore group'}</Button></div></Card>)}
      {visible.length === 0 && <Card><h2 className="font-bold">No communities found</h2><p className="my-3 text-muted">Try another search or explore all the groups.</p><Button variant="secondary" onClick={() => { setQuery(''); setInterest('All interests'); setMine(false) }}>Clear filters</Button></Card>}</section>
      <section aria-label="Community channels" className="min-w-0"><Card className="xl:sticky xl:top-24">{!selected ? <div className="px-4 py-20 text-center"><MessageCircle className="mx-auto mb-5 size-12 text-brand-strong" aria-hidden /><h2 className="text-2xl font-extrabold">Your next conversation starts here.</h2><p className="mx-auto mt-3 max-w-sm text-muted">Explore a group to read its welcome message and discover its channels.</p></div> : <><p className="text-xs font-bold uppercase tracking-wider text-brand-strong">Community space</p><h2 className="mt-2 text-2xl font-extrabold">{selected.name}</h2><p className="mt-3 text-sm text-muted">Be kind, respect boundaries, and keep personal contact details private. Messages are visible to everyone signed in to Nexus. This is not a moderated support service.</p><div className="my-5"><Button variant={joined ? 'secondary' : 'primary'} onClick={() => toggleMembership(selected.id)}>{joined ? 'Leave community' : 'Join community'}</Button></div><div className="flex flex-wrap gap-2 border-y border-line py-4" role="group" aria-label="Channels">{selected.channels.map(c => <button type="button" key={c} aria-pressed={channel === c} onClick={() => { setChannel(c); setText(''); setNotice('') }} className={`flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-bold ${channel === c ? 'bg-brand-tint text-brand-strong' : 'text-muted hover:bg-surface-2'}`}><Hash size={14} />{c}</button>)}</div><h3 className="mt-5 font-bold">#{channel}</h3><div className="my-5 max-h-96 space-y-4 overflow-auto" aria-label="Channel messages"><article className="rounded-xl bg-surface-2 p-4"><p className="text-sm font-extrabold">Nexus <span className="font-normal text-muted">· Welcome note</span></p><p className="mt-2 leading-relaxed">{channel === 'introductions' ? 'Welcome! If you feel like sharing, tell us one thing you enjoy and what brings you here. It’s okay to just listen, too.' : `Welcome to #${channel}. Share an idea, ask a question, or start a conversation about ${selected.interest.toLowerCase()}.`}</p></article>{messages.map(m => <article key={m.id} className="rounded-xl border border-line p-4"><div className="flex flex-wrap items-center justify-between gap-2 text-sm"><strong>{m.mine ? <>{m.name} · You</> : <Link to={`/people/${m.user_id}`} className="hover:text-brand-strong hover:underline">{m.name}</Link>}</strong><span className="flex items-center gap-2"><time className="text-muted" dateTime={m.time}>{new Date(m.time).toLocaleString('en-CA', { timeZone: 'America/Edmonton', dateStyle: 'medium', timeStyle: 'short' })}</time>{m.mine && <button type="button" onClick={() => removeMessage(m.id)} className="rounded px-1.5 text-xs font-bold text-muted hover:bg-surface-2 hover:text-danger" aria-label="Delete your message">Delete</button>}</span></div><p className="mt-2 whitespace-pre-wrap break-words">{m.text}</p></article>)}{chatError && <p className="text-sm text-danger" role="alert">{chatError} <button type="button" className="font-bold underline" onClick={() => setRefresh(v => v + 1)}>Retry</button></p>}</div><form onSubmit={send}><label className="text-sm font-bold" htmlFor="channel-message">{joined ? 'Add to the conversation' : 'Join this community to write a message'}</label><textarea id="channel-message" disabled={!joined} value={text} maxLength={1000} onChange={e => setText(e.target.value)} placeholder="A simple hello is a great start…" className="mt-2 min-h-24 w-full rounded-xl border border-line bg-surface p-3 disabled:opacity-50" /><div className="mt-3 flex items-center justify-between gap-2"><span className="text-xs text-muted">Visible to Nexus members · {text.length}/1000</span><Button type="submit" loading={sending} disabled={!joined || !text.trim()}><Send size={16} /> Post message</Button></div></form></>}<p className="mt-4 text-sm text-muted" role="status">{notice}{groupsError && ` Couldn’t load communities: ${groupsError}`}</p></Card></section>
    </div>
  </div>
}
