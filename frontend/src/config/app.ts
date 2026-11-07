// App identity. Also update <title> in index.html and electron/main.cjs if you rename again.
export const APP = {
  name: 'Nexus',
  tagline: 'Every flyer on every bulletin board, on one neighbourhood map. Find what is on near you, and someone to go with.',
  org: 'Code the Change YYC',
}

export const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

/** Google Maps JavaScript API key. When empty, the map falls back to an offline preview. */
export const GOOGLE_MAPS_API_KEY: string = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? ''
/** Advanced markers need a Map ID. Google's DEMO_MAP_ID works for development. */
export const GOOGLE_MAPS_MAP_ID: string = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID'
