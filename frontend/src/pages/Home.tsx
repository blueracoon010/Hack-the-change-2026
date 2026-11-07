import { Link } from 'react-router-dom'
import { ArrowRight, DollarSign, Gauge, Leaf } from 'lucide-react'
import { StatCard } from '../components/ui'
import { NAV } from '../config/nav'
import { APP } from '../config/app'
import { useAuth } from '../context/AuthContext'
import { useApi } from '../hooks/useApi'
import { fmtMoney, fmtNumber } from '../lib/format'
import type { CurrentSupplyDemand, PoolPriceRow, Sourced } from '../lib/types'

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

export default function Home() {
  const { user } = useAuth()
  const csd = useApi<CurrentSupplyDemand>('/api/energy/current', { refreshMs: 60_000 })
  const price = useApi<Sourced<PoolPriceRow>>('/api/energy/pool-price?days=1', { refreshMs: 300_000 })
  const latestPrice = price.data?.rows.at(-1)

  return (
    <div className="space-y-8">
      <section className="brand-gradient relative overflow-hidden rounded-3xl p-8 text-white shadow-lg shadow-brand/25 animate-in">
        <div aria-hidden className="absolute -right-10 -top-16 size-72 rounded-full bg-white/10" />
        <div aria-hidden className="absolute -bottom-24 right-40 size-60 rounded-full bg-[#00d3a9]/30 blur-2xl" />
        <p className="relative font-bold text-white/85">{greeting()},</p>
        <h1 className="relative mt-1 text-4xl font-extrabold tracking-tight">{user?.name?.split(' ')[0]} 👋</h1>
        <p className="relative mt-3 max-w-xl text-lg text-white/90">{APP.tagline}</p>
        <Link to="/energy" className="relative mt-6 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 font-bold text-[#5a3ff0] shadow hover:bg-white/90">
          Explore live energy data <ArrowRight className="size-4" aria-hidden />
        </Link>
      </section>

      <section aria-label="Alberta grid right now" className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Alberta demand now" value={fmtNumber(csd.data?.summary.alberta_internal_load_ail)} unit="MW"
          icon={<Gauge className="size-5" />} hint={csd.error ? 'Unavailable' : csd.data?.last_update ?? 'Loading…'} />
        <StatCard label="Renewable share" value={fmtNumber(csd.data?.renewable_share_pct, 1)} unit="%"
          icon={<Leaf className="size-5" />} tone="accent" hint="Wind + solar + hydro" />
        <StatCard label="Latest pool price" value={fmtMoney(latestPrice?.price)} unit="/MWh"
          icon={<DollarSign className="size-5" />} tone="pink" hint="Wholesale, last settled hour" />
      </section>

      <section aria-labelledby="quick-links">
        <h2 id="quick-links" className="mb-4 text-xl font-extrabold">Jump in</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {NAV.filter((n) => n.path !== '/').map(({ path, label, icon: Icon }) => (
            <Link key={path} to={path}
              className="group flex items-center gap-4 rounded-2xl border border-line bg-surface p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-brand/50 hover:shadow-md">
              <span className="grid size-12 place-items-center rounded-xl bg-brand-tint text-brand-strong" aria-hidden><Icon className="size-6" /></span>
              <span className="flex-1 text-lg font-bold">{label}</span>
              <ArrowRight className="size-5 text-muted transition group-hover:translate-x-1 group-hover:text-brand-strong" aria-hidden />
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
