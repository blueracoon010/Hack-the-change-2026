// The neighbourhood map. Uses Google Maps when VITE_GOOGLE_MAPS_API_KEY is set,
// otherwise a free OpenStreetMap street map (Leaflet), so it works with no key at all.
import { useEffect, useState, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AdvancedMarker, APIProvider, Map, useMap } from '@vis.gl/react-google-maps'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { MapContainer, Marker, TileLayer, useMap as useLeafletMap, useMapEvents } from 'react-leaflet'
import { GOOGLE_MAPS_API_KEY, GOOGLE_MAPS_MAP_ID } from '../../config/app'
import { CALGARY_CENTER, type LatLng, type NexusEvent, type Person } from '../../lib/nexus'
import { EventPin, PersonPin, YouPin } from './Pins'

export type Selection = { kind: 'event' | 'person'; id: string } | null

export type MapProps = {
  events: NexusEvent[]
  people: Person[]
  selected: Selection
  onSelect: (s: Selection) => void
  /** In "people" mode, events the selected person is going to stay bright; the rest are dimmed. */
  highlightEventIds?: Set<string>
  userPos: LatLng | null
  focus: LatLng | null
}

function useIsDark() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))
  useEffect(() => {
    const el = document.documentElement
    const obs = new MutationObserver(() => setDark(el.classList.contains('dark')))
    obs.observe(el, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])
  return dark
}

export function NexusMap(props: MapProps) {
  return GOOGLE_MAPS_API_KEY ? <GoogleNexusMap {...props} /> : <LeafletNexusMap {...props} />
}

// ---------------- Google Maps ----------------

function PanTo({ focus }: { focus: LatLng | null }) {
  const map = useMap()
  useEffect(() => {
    if (!map || !focus) return
    map.panTo(focus)
    if ((map.getZoom() ?? 12) < 13) map.setZoom(13)
  }, [map, focus])
  return null
}

function GoogleNexusMap({ events, people, selected, onSelect, highlightEventIds, userPos, focus }: MapProps) {
  const dark = useIsDark()
  return (
    <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
      <Map
        key={dark ? 'dark' : 'light'} // colour scheme can only be set when the map is created
        className="size-full"
        mapId={GOOGLE_MAPS_MAP_ID}
        colorScheme={dark ? 'DARK' : 'LIGHT'}
        defaultCenter={focus ?? CALGARY_CENTER}
        defaultZoom={12}
        gestureHandling="greedy"
        disableDefaultUI
        zoomControl
        fullscreenControl
        clickableIcons={false}
        onClick={() => onSelect(null)}
      >
        <PanTo focus={focus} />
        {events.map((e) => {
          const isSel = selected?.kind === 'event' && selected.id === e.id
          return (
            <AdvancedMarker key={e.id} position={e.position} title={e.title} zIndex={isSel ? 50 : 10}
              onClick={() => onSelect({ kind: 'event', id: e.id })}>
              <EventPin event={e} selected={isSel} dimmed={highlightEventIds && !highlightEventIds.has(e.id)} />
            </AdvancedMarker>
          )
        })}
        {people.map((p) => {
          const isSel = selected?.kind === 'person' && selected.id === p.id
          return (
            <AdvancedMarker key={p.id} position={p.position} title={p.name} zIndex={isSel ? 60 : 20}
              onClick={() => onSelect({ kind: 'person', id: p.id })}>
              <PersonPin person={p} selected={isSel} />
            </AdvancedMarker>
          )
        })}
        {userPos && <AdvancedMarker position={userPos} title="You are here" zIndex={5}><YouPin /></AdvancedMarker>}
      </Map>
    </APIProvider>
  )
}

// ---------------- Leaflet + OpenStreetMap (no API key needed) ----------------

// Standard OpenStreetMap tiles: free, no key. Fine for a demo; for production traffic use a tile provider
// (OSM's tile usage policy asks heavy users to). Dark mode inverts the tiles in CSS (.dark .leaflet-tile-pane).
const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

/** HTML pin with a screen-reader label (Leaflet's `alt` only applies to image icons). */
const icon = (node: ReactElement, label: string, w: number, h: number, anchorY = h) =>
  L.divIcon({
    html: renderToStaticMarkup(<><span className="sr-only">{label}</span>{node}</>),
    className: 'nexus-pin', iconSize: [w, h], iconAnchor: [w / 2, anchorY],
  })

function LeafletFocus({ focus, onBackground }: { focus: LatLng | null; onBackground: () => void }) {
  const map = useLeafletMap()
  useMapEvents({ click: onBackground })
  useEffect(() => {
    if (focus) map.flyTo(focus, Math.max(map.getZoom(), 14), { duration: 0.6 })
  }, [map, focus])
  // The map card can resize (window, sidebar collapse); keep tiles filled.
  useEffect(() => {
    const ro = new ResizeObserver(() => map.invalidateSize())
    ro.observe(map.getContainer())
    return () => ro.disconnect()
  }, [map])
  return null
}

function LeafletNexusMap({ events, people, selected, onSelect, highlightEventIds, userPos, focus }: MapProps) {
  return (
    <MapContainer center={focus ?? CALGARY_CENTER} zoom={12} className="size-full" zoomControl attributionControl>
      <TileLayer url={TILE_URL} attribution={ATTRIBUTION} maxZoom={19} />
      <LeafletFocus focus={focus} onBackground={() => onSelect(null)} />
      {events.map((e) => {
        const isSel = selected?.kind === 'event' && selected.id === e.id
        return (
          <Marker key={`${e.id}-${isSel}-${highlightEventIds?.has(e.id) ?? 'all'}`} position={e.position} title={e.title}
            zIndexOffset={isSel ? 1000 : 0}
            icon={icon(<EventPin event={e} selected={isSel} dimmed={highlightEventIds && !highlightEventIds.has(e.id)} />, `Event: ${e.title}`, 36, 46)}
            eventHandlers={{ click: () => onSelect({ kind: 'event', id: e.id }) }} />
        )
      })}
      {people.map((p) => {
        const isSel = selected?.kind === 'person' && selected.id === p.id
        return (
          <Marker key={`${p.id}-${isSel}`} position={p.position} title={p.name} zIndexOffset={isSel ? 1100 : 100}
            icon={icon(<PersonPin person={p} selected={isSel} />, `Person: ${p.name}`, 40, 40, 20)}
            eventHandlers={{ click: () => onSelect({ kind: 'person', id: p.id }) }} />
        )
      })}
      {userPos && <Marker position={userPos} title="You are here" icon={icon(<YouPin />, 'You are here', 20, 20, 10)} interactive={false} />}
    </MapContainer>
  )
}
