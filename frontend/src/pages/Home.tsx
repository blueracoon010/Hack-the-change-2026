import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Bookmark, CalendarDays, MapPin, Search, X, Navigation, ArrowUpRight } from 'lucide-react'
import { getEvents, type CommunityEvent } from '../lib/events'
import './Home.css'

const categories = ['All events', 'Music', 'Arts & Culture', 'Sports', 'Community']
const symbols: Record<string, string> = { Music: '♫', 'Arts & Culture': '✦', Sports: '⚑', Community: '☀' }
const dateLabel = (date: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(date))

export default function Home() {
  const [events, setEvents] = useState<CommunityEvent[]>([])
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All events')
  const [selected, setSelected] = useState<CommunityEvent | null>(null)
  const [saved, setSaved] = useState<string[]>([])
  const [free, setFree] = useState(false)
  const [tilesFailed, setTilesFailed] = useState(false)
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const markers = useRef<L.LayerGroup | null>(null)
  useEffect(() => { let active = true; getEvents().then(data => { if (active) setEvents(data) }); return () => { active = false } }, [])
  const filtered = useMemo(() => events.filter(event => (category === 'All events' || event.category === category) && (!free || event.price === 0) && `${event.title} ${event.venue} ${event.category}`.toLowerCase().includes(query.toLowerCase())), [events, category, query, free])
  useEffect(() => {
    if (!container.current) return
    const instance = L.map(container.current, { scrollWheelZoom: false }).setView([51.045, -114.065], 13)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom: 19 }).on('tileerror', () => setTilesFailed(true)).addTo(instance)
    map.current = instance
    markers.current = L.layerGroup().addTo(instance)
    const observer = new ResizeObserver(() => instance.invalidateSize())
    observer.observe(container.current)
    return () => { observer.disconnect(); instance.remove(); map.current = null; markers.current = null }
  }, [])
  useEffect(() => {
    markers.current?.clearLayers()
    filtered.forEach(event => {
      const icon = L.divIcon({ className: 'event-marker-wrapper', html: `<span class="event-pin ${selected?.id === event.id ? 'is-selected' : ''}" data-category="${event.category}">${symbols[event.category]}</span>`, iconSize: [44, 48], iconAnchor: [22, 46] })
      L.marker([event.lat, event.lng], { icon, title: event.title, alt: event.title, keyboard: true }).on('click', () => setSelected(event)).addTo(markers.current!)
    })
  }, [filtered, selected])
  useEffect(() => { if (selected) map.current?.panTo([selected.lat, selected.lng]) }, [selected])
  useEffect(() => { setSelected(null) }, [query, category, free])
  function toggleSave(id: string) { setSaved(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]) }
  return <div className="discover-page">
    <div className="discover-heading"><div><p className="discover-eyebrow">CORKBOARD YYC · EXPLORE YOUR CITY</p><h1>A little closer to your community.</h1><p>Find your next experience. Maybe your next friend, too.</p></div><span className="city-label"><MapPin size={16} /> Calgary, AB</span></div>
    <div className="discovery-tools"><label className="event-search"><Search size={20} /><span className="sr-only">Search events or venues</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search events, interests, or places…" /></label><div className="category-filters" aria-label="Event categories">{categories.map(item => <button type="button" key={item} aria-pressed={category === item} className={category === item ? 'active' : ''} onClick={() => setCategory(item)}>{symbols[item]} {item}</button>)}<button type="button" aria-pressed={free} className={free ? 'active' : ''} onClick={() => setFree(!free)}>Free only</button></div></div>
    <div className="discovery-workspace">
      <section className="event-results" aria-label="Event results"><div className="results-heading"><h2>Something for you</h2><span aria-live="polite">{filtered.length} events</span></div><p className="sample-note">Preview · sample events, not live Ticketmaster listings</p>
        <div className="event-card-list">{filtered.map(event => <article key={event.id} className={`event-card ${selected?.id === event.id ? 'selected' : ''}`}><button type="button" className="event-card-main" onClick={() => setSelected(event)} aria-label={`Show ${event.title} on the map`}><span className="event-art" data-category={event.category} aria-hidden="true">{symbols[event.category]}</span><span className="event-card-copy"><span className="event-category">{event.category}</span><strong>{event.title}</strong><span><CalendarDays size={13} /> {dateLabel(event.date)}</span><span><MapPin size={13} /> {event.venue}</span><b>{event.price === 0 ? 'Free entry' : `From $${event.price} CAD`}</b></span></button><button className="save-event" type="button" aria-label={`${saved.includes(event.id) ? 'Unsave' : 'Save'} ${event.title}`} aria-pressed={saved.includes(event.id)} onClick={() => toggleSave(event.id)}><Bookmark size={18} fill={saved.includes(event.id) ? 'currentColor' : 'none'} /></button></article>)}{filtered.length === 0 && <div className="empty-events"><Search size={28} /><h3>No events found</h3><p>Try another interest or clear your filters.</p><button type="button" onClick={() => { setQuery(''); setCategory('All events'); setFree(false) }}>Clear filters</button></div>}</div>
      </section>
      <section className="event-map-panel" aria-label="Calgary event map"><div ref={container} className="event-map" aria-label="Interactive Calgary map. Use arrow keys to pan and plus or minus to zoom." />
        <button className="reset-map" type="button" onClick={() => { map.current?.setView([51.045, -114.065], 13); setSelected(null) }}><Navigation size={16} /> Calgary</button>
        {tilesFailed && <p className="map-network-message" role="status">Map tiles could not load. You can still explore events in the list.</p>}
        {selected && <div className="map-event-detail" role="region" aria-label="Selected event details"><button type="button" className="close-detail" aria-label="Close event details" onClick={() => setSelected(null)}><X size={18} /></button><span className="event-category">{selected.category}</span><h2>{selected.title}</h2><p><CalendarDays size={16} /> {dateLabel(selected.date)} · Calgary time</p><p><MapPin size={16} /> {selected.venue}</p><p className="event-description">{selected.description}</p><div className="detail-footer"><strong>{selected.price === 0 ? 'Free entry' : `From $${selected.price} CAD`}</strong><a href={`https://www.google.com/maps/dir/?api=1&destination=${selected.lat},${selected.lng}`} target="_blank" rel="noreferrer">Directions <ArrowUpRight size={16} /></a></div></div>}
        <div className="map-hint">A new connection could be just around the corner.</div>
      </section>
    </div>
  </div>
}
