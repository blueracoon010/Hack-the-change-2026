// 7-day Calgary forecast from Open-Meteo (free, no API key). Used for weather-aware event cards and reminders.
import { useEffect, useState } from 'react'

export type DayForecast = { date: string; code: number; max: number; min: number; precip: number }

const URL = 'https://api.open-meteo.com/v1/forecast?latitude=51.05&longitude=-114.07'
  + '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=America%2FEdmonton'

let cache: Promise<DayForecast[]> | null = null

function load() {
  cache ??= fetch(URL)
    .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json() })
    .then((j) => (j.daily.time as string[]).map((date, i) => ({
      date,
      code: j.daily.weather_code[i],
      max: j.daily.temperature_2m_max[i],
      min: j.daily.temperature_2m_min[i],
      precip: j.daily.precipitation_probability_max[i] ?? 0,
    })))
    .catch((e) => { cache = null; throw e })
  return cache
}

export function useWeather() {
  const [days, setDays] = useState<DayForecast[] | null>(null)
  useEffect(() => { load().then(setDays).catch(() => setDays(null)) }, [])
  return days
}

const localISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function forecastFor(days: DayForecast[] | null, when: Date) {
  return days?.find((d) => d.date === localISO(when)) ?? null
}

/** WMO weather code → short label + emoji. */
export function describe(code: number) {
  if (code === 0) return { label: 'Clear', emoji: '☀️' }
  if (code <= 2) return { label: 'Partly cloudy', emoji: '⛅' }
  if (code === 3) return { label: 'Cloudy', emoji: '☁️' }
  if (code <= 48) return { label: 'Fog', emoji: '🌫️' }
  if (code <= 57) return { label: 'Drizzle', emoji: '🌦️' }
  if (code <= 67) return { label: 'Rain', emoji: '🌧️' }
  if (code <= 77) return { label: 'Snow', emoji: '🌨️' }
  if (code <= 82) return { label: 'Showers', emoji: '🌧️' }
  if (code <= 86) return { label: 'Snow showers', emoji: '🌨️' }
  return { label: 'Thunderstorm', emoji: '⛈️' }
}

/** A plain-language tip for outdoor events, or null when the weather is fine. */
export function weatherTip(f: DayForecast | null, indoor: boolean) {
  if (!f || indoor) return null
  if (f.max <= -15) return 'Extreme cold expected. Dress in layers, or consider skipping.'
  if (f.code >= 71 && f.code <= 86) return 'Snow in the forecast. Wear boots and give yourself extra travel time.'
  if (f.precip >= 50) return `${f.precip}% chance of rain. Bring a jacket.`
  if (f.max <= -5) return 'Cold day. Wear a warm hat and gloves.'
  return null
}
