// Shapes returned by the backend. Keep in sync with backend/app/schemas.py and services/.
export type User = { id: number; name: string; email: string; created_at: string }
export type TokenResponse = { access_token: string; token_type: string; user: User }

export type Sourced<T> = { source: string; source_url: string; rows: T[] }

export type CurrentSupplyDemand = {
  source: string
  source_url: string
  fetched_at: string
  last_update: string | null
  summary: Record<string, number | null>
  generation: { fuel: string; max_capability_mw: number | null; net_generation_mw: number | null; dispatched_reserve_mw: number | null }[]
  interchange: { path: string; flow_mw: number | null }[]
  renewable_share_pct: number | null
}

export type PoolPriceRow = { time: string; price: number; rolling_30d_avg: number | null; ail_mw: number | null }

export type MlForecast = {
  model: { mae_mw?: number; mape_pct?: number; improvement_vs_baseline_pct?: number; trained_at?: string }
  history: PoolPriceRow[]
  forecast: { time: string; predicted_ail_mw: number }[]
}

export type SolarMonth = { period: string; kwh: number; sites: number }
export type SolarSite = { name: string; address: string | null; kwh: number }
