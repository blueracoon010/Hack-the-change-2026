// Small map for choosing where an event happens: tap or click to drop the pin, drag it to adjust.
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { MapContainer, Marker, TileLayer, useMapEvents } from 'react-leaflet'
import { CALGARY_CENTER, type LatLng } from '../../lib/nexus'

const pin = L.divIcon({
  className: 'nexus-pin',
  html: '<span style="display:block;width:28px;height:28px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:var(--brand);border:3px solid #fff;box-shadow:0 3px 8px rgb(0 0 0 / .3)"></span>',
  iconSize: [28, 28],
  iconAnchor: [14, 28],
})

function ClickToPlace({ onPick }: { onPick: (p: LatLng) => void }) {
  useMapEvents({ click: (e) => onPick({ lat: e.latlng.lat, lng: e.latlng.lng }) })
  return null
}

export function LocationPicker({ value, onChange }: { value: LatLng | null; onChange: (p: LatLng | null) => void }) {
  return (
    <div className="relative h-64 overflow-hidden rounded-2xl border border-line">
      <MapContainer center={value ?? CALGARY_CENTER} zoom={value ? 15 : 11} className="size-full" scrollWheelZoom={false}>
        <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19}
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' />
        <ClickToPlace onPick={onChange} />
        {value && (
          <Marker position={value} icon={pin} draggable title="Event location"
            eventHandlers={{ dragend: (e) => { const ll = (e.target as L.Marker).getLatLng(); onChange({ lat: ll.lat, lng: ll.lng }) } }} />
        )}
      </MapContainer>
      {value && (
        <button type="button" onClick={() => onChange(null)}
          className="absolute right-3 top-3 z-[500] rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-bold shadow-sm hover:bg-surface-2">
          Remove pin
        </button>
      )}
    </div>
  )
}
