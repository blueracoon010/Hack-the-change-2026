// Nexus domain types, filter metadata and sample data.
// Events are LIVE from the backend (GET /api/events, see backend/app/events/README.md) via `fromApi` below.
// SAMPLE_PEOPLE is still sample data until the people/connections routes exist.
import type { LucideIcon } from 'lucide-react'
import { Cpu, Dumbbell, HeartHandshake, Palette, Soup, Sprout, Trees, Users, Baby, GraduationCap } from 'lucide-react'

export type Category = 'tech' | 'social' | 'outdoors' | 'arts' | 'food' | 'sports' | 'family' | 'learning' | 'wellness' | 'volunteer'
/** How much social energy an event asks for. Shown as the introvert / extrovert filter. */
export type Vibe = 'introvert' | 'extrovert' | 'either'

export type LatLng = { lat: number; lng: number }

export type NexusEvent = {
  id: string
  title: string
  host: string // usually a community association
  categories: Category[]
  vibe: Vibe
  start: Date
  durationMin: number
  venue: string
  address: string
  position: LatLng
  cost: string // "Free", "$5", "Pay what you can"
  indoor: boolean
  going: number
  lookingForBuddy: number
  languages: string[] // languages the flyer / host supports
  description: string
  scannedFrom: string // where the flyer was photographed
  // Set for live events from the backend:
  source?: 'ticketmaster' | 'meetup' | 'calgary' | 'community'
  url?: string | null // tickets / RSVP on the source site
  imageUrl?: string | null
  meGoing?: boolean
  meLookingForBuddy?: boolean
  mine?: boolean // you created it
  byFollowing?: boolean // created by someone you follow
  visibility?: Visibility
}

/** public = everyone; private = friends only (people you follow who follow you back). */
export type Visibility = 'public' | 'private'

/** One event as GET /api/events returns it (dates are ISO strings). */
export type ApiEvent = Omit<NexusEvent, 'start' | 'categories'> & {
  start: string
  end: string | null
  categories: string[]
  isOnline: boolean
  distanceKm: number | null
  mine: boolean
}

/** API event -> NexusEvent (parses the date, drops categories the UI doesn't know). */
export function fromApi(e: ApiEvent): NexusEvent {
  return { ...e, start: new Date(e.start), categories: e.categories.filter((c): c is Category => c in CATEGORIES) }
}

/** Where a live event came from, for the "Listed on …" credit. */
export const SOURCE_LABEL: Record<NonNullable<NexusEvent['source']>, string> = {
  ticketmaster: 'Ticketmaster', meetup: 'Meetup', calgary: 'City of Calgary', community: 'Nexus community',
}

export type Relation = 'following' | 'connection'

export type Person = {
  id: string
  name: string
  relation: Relation
  neighbourhood: string
  /** Neighbourhood-level location only, never a home address. */
  position: LatLng
  color: string
  interests: Category[]
  openToBuddy: boolean
  goingTo: string[] // event ids
  languages: string[]
}

// Colours are CSS variables (src/index.css) so light and dark mode can each use their own set.
export const CATEGORIES: Record<Category, { label: string; icon: LucideIcon; color: string }> = {
  tech: { label: 'Tech', icon: Cpu, color: 'var(--cat-tech)' },
  social: { label: 'Social', icon: Users, color: 'var(--cat-social)' },
  outdoors: { label: 'Outdoorsy', icon: Trees, color: 'var(--cat-outdoors)' },
  arts: { label: 'Arts', icon: Palette, color: 'var(--cat-arts)' },
  food: { label: 'Food', icon: Soup, color: 'var(--cat-food)' },
  sports: { label: 'Sports', icon: Dumbbell, color: 'var(--cat-sports)' },
  family: { label: 'Family', icon: Baby, color: 'var(--cat-family)' },
  learning: { label: 'Learning', icon: GraduationCap, color: 'var(--cat-learning)' },
  wellness: { label: 'Wellness', icon: Sprout, color: 'var(--cat-wellness)' },
  volunteer: { label: 'Volunteer', icon: HeartHandshake, color: 'var(--cat-volunteer)' },
}

export const VIBES: Record<Vibe, { label: string; short: string; hint: string }> = {
  introvert: { label: 'Introvert-friendly', short: 'Quiet', hint: 'Small group, low pressure, easy to slip in' },
  extrovert: { label: 'Extrovert', short: 'Lively', hint: 'Big crowd, mingling, loud and fun' },
  either: { label: 'Either', short: 'Mixed', hint: 'Come for the activity, talk as much as you like' },
}

/** Downtown Calgary. Used when we don't have the user's location. */
export const CALGARY_CENTER: LatLng = { lat: 51.0447, lng: -114.0719 }

// ---------- helpers ----------

/** Distance in km (haversine). */
export function distanceKm(a: LatLng, b: LatLng) {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

export function fmtDistance(km: number) {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`
}

/** Every date in the app is shown in Calgary time, whatever time zone the laptop is set to, so all devices agree. */
export const TIME_ZONE = 'America/Edmonton'

/**
 * Calgary's offset from UTC, in minutes. We work it out ourselves instead of asking the browser, because
 * Alberta stopped changing its clocks: after springing forward on March 8, 2026 it stays on UTC-6
 * ("Alberta Time") all year, and many browsers' time-zone data still expects it to fall back to UTC-7.
 * Before that: Mountain time, UTC-7, with daylight saving (UTC-6) from the 2nd Sunday of March to the 1st Sunday of November.
 */
export function calgaryOffsetMin(d: Date): number {
  const t = d.getTime()
  if (t >= Date.UTC(2026, 2, 8, 9)) return -360
  const y = d.getUTCFullYear()
  const sunday = (month: number, n: number) => 1 + ((7 - new Date(Date.UTC(y, month, 1)).getUTCDay()) % 7) + 7 * (n - 1)
  const dstStart = Date.UTC(y, 2, sunday(2, 2), 9) // 2 a.m. MST
  const dstEnd = Date.UTC(y, 10, sunday(10, 1), 8) // 2 a.m. MDT
  return t >= dstStart && t < dstEnd ? -360 : -420
}

/** A Date whose UTC fields read as Calgary wall-clock time. Only for formatting with timeZone: 'UTC'. */
const calgaryWall = (d: Date) => new Date(d.getTime() + calgaryOffsetMin(d) * 60_000)

/** Format a moment in Calgary time, e.g. fmtCalgary(d, { month: 'short', day: 'numeric' }). */
export const fmtCalgary = (d: Date, options: Intl.DateTimeFormatOptions) =>
  calgaryWall(d).toLocaleString('en-CA', { ...options, timeZone: 'UTC' })

/** Calendar day in Calgary, e.g. "2026-11-07". Use this instead of toDateString() for "today" checks. */
export const calgaryDay = (d: Date) => calgaryWall(d).toISOString().slice(0, 10)

export const fmtTime = (d: Date) => fmtCalgary(d, { hour: 'numeric', minute: '2-digit' })

const sameDay = (a: Date, b: Date) => calgaryDay(a) === calgaryDay(b)

const calgaryParts = (d: Date) => {
  const iso = calgaryWall(d).toISOString() // "2026-11-08T18:00:00.000Z" in Calgary wall time
  return { year: iso.slice(0, 4), month: iso.slice(5, 7), day: iso.slice(8, 10), hour: iso.slice(11, 13), minute: iso.slice(14, 16) }
}

/** Date -> "2026-11-08T18:00" in Calgary time, for <input type="datetime-local">. */
export function toCalgaryInput(d: Date) {
  const p = calgaryParts(d)
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`
}

/** "2026-11-08T18:00" typed as Calgary time -> the real instant, whatever time zone this laptop is set to. */
export function fromCalgaryInput(value: string): Date {
  const [day, time] = value.split('T')
  const [y, m, d] = day.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  const wall = Date.UTC(y, m - 1, d, hh, mm)
  const offset = (ts: number) => calgaryOffsetMin(new Date(ts)) * 60_000
  return new Date(wall - offset(wall - offset(wall))) // twice, so daylight-saving changeovers land right
}

const DAY_MIN = 24 * 60
const atMidnight = (d: Date) => { const p = calgaryParts(d); return p.hour === '00' && p.minute === '00' }

/** Events created with just a From and To date run from midnight for whole days (Calgary time). */
export const isAllDay = (start: Date, durationMin: number) => atMidnight(start) && durationMin > 0 && durationMin % DAY_MIN === 0

/** "Today", "Tomorrow" or "Sat, Nov 8". */
export function fmtDay(d: Date, now = new Date()) {
  if (sameDay(d, now)) return 'Today'
  if (sameDay(d, new Date(now.getTime() + 24 * 3600_000))) return 'Tomorrow'
  return fmtCalgary(d, { weekday: 'short', month: 'short', day: 'numeric' })
}

/** "Tomorrow · 6:00 p.m."; all-day events show "Tomorrow · All day" or "Sat, Nov 8 – Mon, Nov 10". */
export function fmtWhen(d: Date, durationMin?: number) {
  if (durationMin !== undefined && isAllDay(d, durationMin)) {
    const days = durationMin / DAY_MIN
    // Midday of the last day, so a daylight-saving change can't push it onto the wrong date.
    return days === 1 ? `${fmtDay(d)} · All day` : `${fmtDay(d)} – ${fmtDay(new Date(d.getTime() + ((days - 1) * 24 + 12) * 3600_000))}`
  }
  if (durationMin === undefined && atMidnight(d)) return fmtDay(d)
  return `${fmtDay(d)} · ${fmtTime(d)}`
}

/** Full span for the event detail: "Tomorrow · 6:00 p.m.–8:00 p.m.", or the dates for all-day events. */
export function fmtSpan(start: Date, durationMin: number) {
  if (isAllDay(start, durationMin)) return fmtWhen(start, durationMin)
  return `${fmtWhen(start)}–${fmtTime(new Date(start.getTime() + durationMin * 60_000))}`
}

export function initials(name: string) {
  return name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase()
}

/** A date `days` from today at hh:mm local time, so the sample data always looks current. */
function at(days: number, hh: number, mm = 0) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  d.setHours(hh, mm, 0, 0)
  return d
}

// ---------- sample data (replace with API) ----------

export const SAMPLE_EVENTS: NexusEvent[] = [
  {
    id: 'e1', title: 'Intro to Arduino: build a plant moisture sensor', host: 'Hillhurst Sunnyside Community Association',
    categories: ['tech', 'learning'], vibe: 'introvert', start: at(0, 18, 30), durationMin: 120,
    venue: 'Hillhurst Sunnyside Community Centre', address: '1320 5 Ave NW', position: { lat: 51.0549, lng: -114.0915 },
    cost: '$10 (kit included)', indoor: true, going: 14, lookingForBuddy: 3, languages: ['English', '中文'],
    description: 'Hands-on, small table groups of four. No experience needed, laptops provided. Take your sensor home.',
    scannedFrom: 'Louise Riley Library bulletin board',
  },
  {
    id: 'e2', title: 'Bridgeland Fall Pancake Breakfast', host: 'Bridgeland-Riverside Community Association',
    categories: ['food', 'social', 'family'], vibe: 'extrovert', start: at(1, 9), durationMin: 180,
    venue: 'Bridgeland-Riverside Community Centre', address: '917 Centre Ave NE', position: { lat: 51.0519, lng: -114.0451 },
    cost: 'Pay what you can', indoor: true, going: 86, lookingForBuddy: 5, languages: ['English', 'Italiano', 'Tiếng Việt'],
    description: 'Pancakes, sausages and live fiddle music. Volunteers welcome for the flipping shift.',
    scannedFrom: 'Co-op Bridgeland entrance board',
  },
  {
    id: 'e3', title: 'Bow River pathway clean-up walk', host: 'Inglewood Community Association',
    categories: ['outdoors', 'volunteer'], vibe: 'either', start: at(1, 13), durationMin: 120,
    venue: 'Pearce Estate Park', address: '1440 17A St SE', position: { lat: 51.0408, lng: -114.0069 },
    cost: 'Free', indoor: false, going: 22, lookingForBuddy: 4, languages: ['English', 'Español'],
    description: 'Gloves and bags provided. A relaxed walk along the river, pick up litter, hot chocolate after.',
    scannedFrom: 'Inglewood Safeway community board',
  },
  {
    id: 'e4', title: 'Silent book club', host: 'Cliff Bungalow-Mission Community Association',
    categories: ['social', 'arts'], vibe: 'introvert', start: at(2, 19), durationMin: 90,
    venue: 'Mission Community Hall', address: '2201 Cliff St SW', position: { lat: 51.0331, lng: -114.0745 },
    cost: 'Free', indoor: true, going: 11, lookingForBuddy: 2, languages: ['English', 'Français'],
    description: 'Bring any book and read quietly together for an hour. Optional chat over tea after. Zero pressure.',
    scannedFrom: 'Mission Village Square',
  },
  {
    id: 'e5', title: 'Bowness Park skate & bonfire night', host: 'Bowness Community Association',
    categories: ['outdoors', 'sports', 'social'], vibe: 'extrovert', start: at(3, 18), durationMin: 150,
    venue: 'Bowness Park lagoon', address: '8900 48 Ave NW', position: { lat: 51.0968, lng: -114.2156 },
    cost: 'Free', indoor: false, going: 54, lookingForBuddy: 7, languages: ['English', 'ਪੰਜਾਬੀ'],
    description: 'Skate rentals on site. Bonfire, s\'mores and a DJ. Dress warm, it gets cold by the water.',
    scannedFrom: 'Bowness Library bulletin board',
  },
  {
    id: 'e6', title: 'Newcomer coffee & conversation circle', host: 'Forest Lawn Community Association',
    categories: ['social', 'learning'], vibe: 'either', start: at(0, 10, 30), durationMin: 90,
    venue: 'Forest Lawn Library', address: '4807 8 Ave SE', position: { lat: 51.0436, lng: -113.9658 },
    cost: 'Free', indoor: true, going: 19, lookingForBuddy: 6, languages: ['English', 'العربية', 'Tagalog', 'Українська'],
    description: 'Practise English in a friendly small-table setting. Volunteers help with settlement questions too.',
    scannedFrom: 'Forest Lawn Library entrance',
  },
  {
    id: 'e7', title: 'Seniors chair yoga', host: 'Bankview Community Association',
    categories: ['wellness', 'sports'], vibe: 'introvert', start: at(2, 10), durationMin: 60,
    venue: 'Bankview Community Hall', address: '2418 17 St SW', position: { lat: 51.0355, lng: -114.1035 },
    cost: '$3 drop-in', indoor: true, going: 12, lookingForBuddy: 1, languages: ['English'],
    description: 'Gentle seated yoga for all mobility levels. Chairs provided, accessible entrance at the back.',
    scannedFrom: 'Safeway 17 Ave SW',
  },
  {
    id: 'e8', title: 'Hack Night: civic tech for Calgary', host: 'Beltline Neighbourhoods Association',
    categories: ['tech', 'social', 'volunteer'], vibe: 'extrovert', start: at(4, 18), durationMin: 180,
    venue: 'Beltline Community Centre', address: '1320 12 Ave SW', position: { lat: 51.0405, lng: -114.0888 },
    cost: 'Free (pizza!)', indoor: true, going: 41, lookingForBuddy: 8, languages: ['English', 'Español'],
    description: 'Lightning talks, then team up on open-data projects with the City. All skill levels, non-coders welcome.',
    scannedFrom: 'Memorial Park Library',
  },
  {
    id: 'e9', title: 'Community garden harvest & potluck', host: 'Tuxedo Park Community Association',
    categories: ['food', 'outdoors', 'family'], vibe: 'either', start: at(5, 16), durationMin: 150,
    venue: 'Tuxedo Park community garden', address: '202 29 Ave NE', position: { lat: 51.0759, lng: -114.0574 },
    cost: 'Bring a dish', indoor: false, going: 27, lookingForBuddy: 2, languages: ['English', 'Tiếng Việt', 'Español'],
    description: 'Help harvest the last of the beds, then share a potluck in the hall if it rains.',
    scannedFrom: 'Crescent Heights No Frills',
  },
  {
    id: 'e10', title: 'Watercolour sketch walk', host: 'Ramsay Community Association',
    categories: ['arts', 'outdoors'], vibe: 'introvert', start: at(6, 14), durationMin: 120,
    venue: 'Scotsman\'s Hill lookout', address: 'Salisbury St SE', position: { lat: 51.0364, lng: -114.0427 },
    cost: 'Free', indoor: false, going: 9, lookingForBuddy: 3, languages: ['English', 'Français'],
    description: 'Paint the skyline with a local artist. Supplies to share. Small group, beginners very welcome.',
    scannedFrom: 'Ramsay community board',
  },
  {
    id: 'e11', title: 'Family board game afternoon', host: 'Varsity Community Association',
    categories: ['family', 'social'], vibe: 'either', start: at(3, 13), durationMin: 180,
    venue: 'Varsity Community Centre', address: '4303 Varsity Dr NW', position: { lat: 51.0889, lng: -114.1474 },
    cost: 'Free', indoor: true, going: 33, lookingForBuddy: 2, languages: ['English', '中文', 'فارسی'],
    description: 'Hundreds of games to borrow, game teachers on hand. Snacks by the youth club.',
    scannedFrom: 'Market Mall community wall',
  },
  {
    id: 'e12', title: 'Marda Loop pickleball social', host: 'Marda Loop Communities Association',
    categories: ['sports', 'social'], vibe: 'extrovert', start: at(2, 18, 30), durationMin: 120,
    venue: 'MLCA Community Hall gym', address: '3130 16 St SW', position: { lat: 51.0215, lng: -114.1009 },
    cost: '$5', indoor: true, going: 24, lookingForBuddy: 4, languages: ['English'],
    description: 'Rotating doubles so you meet everyone. Paddles to borrow. Beginners rotate on court 3.',
    scannedFrom: 'Marda Loop Safeway',
  },
  {
    id: 'e13', title: 'Python for absolute beginners', host: 'Haysboro Community Association',
    categories: ['tech', 'learning'], vibe: 'introvert', start: at(5, 19), durationMin: 90,
    venue: 'Haysboro Community Centre', address: '1204 89 Ave SW', position: { lat: 50.9727, lng: -114.0817 },
    cost: 'Free', indoor: true, going: 16, lookingForBuddy: 5, languages: ['English', 'ਪੰਜਾਬੀ', 'हिन्दी'],
    description: 'Week 1 of 4. Learn to automate boring tasks. Bring a laptop if you have one, loaners available.',
    scannedFrom: 'Southwood Library',
  },
  {
    id: 'e14', title: 'Evanston winter market', host: 'Evanston Creekside Community Association',
    categories: ['food', 'arts', 'family'], vibe: 'extrovert', start: at(6, 11), durationMin: 300,
    venue: 'Evanston Square', address: 'Evanston Dr NW', position: { lat: 51.1757, lng: -114.1086 },
    cost: 'Free entry', indoor: false, going: 120, lookingForBuddy: 6, languages: ['English', 'Tagalog', 'Español'],
    description: 'Forty local makers, hot food trucks and carollers. Heated tent in case of a cold snap.',
    scannedFrom: 'Save-On-Foods Evanston',
  },
  {
    id: 'e15', title: 'Lake Mahogany sunrise walk club', host: 'Mahogany Community Association',
    categories: ['outdoors', 'wellness'], vibe: 'either', start: at(1, 8), durationMin: 60,
    venue: 'Mahogany Beach Club', address: '20 Mahogany Way SE', position: { lat: 50.8936, lng: -113.9298 },
    cost: 'Free', indoor: false, going: 15, lookingForBuddy: 2, languages: ['English', 'Українська'],
    description: '5 km loop around the lake at an easy pace. Dogs welcome on leash.',
    scannedFrom: 'Mahogany Village Market',
  },
]

export const SAMPLE_PEOPLE: Person[] = [
  { id: 'p1', name: 'Amara Okafor', relation: 'connection', neighbourhood: 'Sunnyside', position: { lat: 51.0566, lng: -114.0822 }, color: '#e0457b', interests: ['tech', 'arts'], openToBuddy: true, goingTo: ['e1', 'e8'], languages: ['English', 'Français'] },
  { id: 'p2', name: 'Diego Ramírez', relation: 'connection', neighbourhood: 'Inglewood', position: { lat: 51.0375, lng: -114.0185 }, color: '#0e8a5f', interests: ['outdoors', 'volunteer'], openToBuddy: true, goingTo: ['e3', 'e9'], languages: ['Español', 'English'] },
  { id: 'p3', name: 'Mei Lin', relation: 'following', neighbourhood: 'Varsity', position: { lat: 51.0868, lng: -114.1405 }, color: '#5a3ff0', interests: ['family', 'tech'], openToBuddy: false, goingTo: ['e11'], languages: ['中文', 'English'] },
  { id: 'p4', name: 'Harpreet Sandhu', relation: 'connection', neighbourhood: 'Haysboro', position: { lat: 50.9758, lng: -114.0756 }, color: '#c2410c', interests: ['learning', 'tech'], openToBuddy: true, goingTo: ['e13', 'e8'], languages: ['ਪੰਜਾਬੀ', 'English'] },
  { id: 'p5', name: 'Olena Kovalenko', relation: 'following', neighbourhood: 'Forest Lawn', position: { lat: 51.0412, lng: -113.9725 }, color: '#0369a1', interests: ['social', 'wellness'], openToBuddy: true, goingTo: ['e6', 'e15'], languages: ['Українська', 'English'] },
  { id: 'p6', name: 'Walter Brooks', relation: 'connection', neighbourhood: 'Bankview', position: { lat: 51.0372, lng: -114.1085 }, color: '#7c3aed', interests: ['wellness', 'social'], openToBuddy: true, goingTo: ['e7', 'e4'], languages: ['English'] },
  { id: 'p7', name: 'Jasmine Reyes', relation: 'following', neighbourhood: 'Evanston', position: { lat: 51.1725, lng: -114.1132 }, color: '#b45309', interests: ['food', 'arts'], openToBuddy: false, goingTo: ['e14'], languages: ['Tagalog', 'English'] },
  { id: 'p8', name: 'Sam Nguyen', relation: 'connection', neighbourhood: 'Beltline', position: { lat: 51.0388, lng: -114.0812 }, color: '#be123c', interests: ['sports', 'tech'], openToBuddy: true, goingTo: ['e12', 'e8'], languages: ['Tiếng Việt', 'English'] },
]
