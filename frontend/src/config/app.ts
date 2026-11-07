// App identity. Also update <title> in index.html and electron/main.cjs if you rename again.
export const APP = {
  name: 'Nexus',
  tagline: 'Never miss out. Never go alone.',
  org: 'Code the Change YYC',
}

export const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

/** Google Maps JavaScript API key. When empty, the map falls back to an offline preview. */
export const GOOGLE_MAPS_API_KEY: string = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? ''
/** Advanced markers need a Map ID. Google's DEMO_MAP_ID works for development. */
export const GOOGLE_MAPS_MAP_ID: string = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID'

/** Where the app is opened, for invite links. Electron runs from file://, so fall back to the dev server address. */
export const APP_URL: string = (import.meta.env.VITE_APP_URL as string | undefined)
  || (typeof location !== 'undefined' && location.protocol.startsWith('http') ? location.origin + location.pathname : 'http://localhost:5173/')
