// Replace this async adapter with your backend Ticketmaster endpoint.
// Keep provider API keys on the server. Coordinates and prices are normalized here.
export type CommunityEvent = {
  id: string
  title: string
  category: 'Music' | 'Arts & Culture' | 'Sports' | 'Community'
  date: string
  venue: string
  lat: number
  lng: number
  price: number
  description: string
}
const mockEvents: CommunityEvent[] = [
  { id: 'demo-1', title: 'An evening of indie sounds', category: 'Music', date: '2026-11-14T19:00:00-07:00', venue: 'The Palace Theatre', lat: 51.0452, lng: -114.0676, price: 25, description: 'Sample event: discover local sounds in an evening of live music. Bring a friend or enjoy the show on your own.' },
  { id: 'demo-2', title: 'Art, conversation & coffee', category: 'Arts & Culture', date: '2026-11-15T11:00:00-07:00', venue: 'Contemporary Calgary', lat: 51.0473, lng: -114.0916, price: 15, description: 'Sample event: explore art and share perspectives. No art knowledge needed.' },
  { id: 'demo-3', title: 'A night at the rink', category: 'Sports', date: '2026-11-14T18:00:00-07:00', venue: 'Scotiabank Saddledome', lat: 51.0374, lng: -114.0519, price: 35, description: 'Sample event: experience the energy of a hockey night with your Calgary community.' },
  { id: 'demo-4', title: 'Sunday river walk', category: 'Community', date: '2026-11-15T10:00:00-07:00', venue: 'Prince’s Island Park', lat: 51.0553, lng: -114.0704, price: 0, description: 'Sample event: an easy-paced walk along the Bow River. Meet at the south entrance; newcomers are welcome.' },
  { id: 'demo-5', title: 'Stories that bring us together', category: 'Community', date: '2026-11-15T14:00:00-07:00', venue: 'Central Library', lat: 51.0454, lng: -114.0331, price: 0, description: 'Sample event: meet neighbours and share a favourite story. Listening is welcome too.' },
  { id: 'demo-6', title: 'Jazz after hours', category: 'Music', date: '2026-11-20T19:30:00-07:00', venue: 'Studio Bell', lat: 51.0444, lng: -114.0341, price: 20, description: 'Sample event: settle into an evening of jazz and discover a new favourite artist.' },
]
export async function getEvents(): Promise<CommunityEvent[]> { return mockEvents }
