import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Lightbulb, Sun } from 'lucide-react'
import { ChartCard, chartTheme } from '../components/ChartCard'
import { Card, ErrorState, Loading, PageHeader, StatCard } from '../components/ui'
import { useApi } from '../hooks/useApi'
import { fmtMonth, fmtNumber } from '../lib/format'
import type { Sourced, SolarMonth, SolarSite } from '../lib/types'

export default function Community() {
  const monthly = useApi<Sourced<SolarMonth>>('/api/calgary/solar/monthly?months=24')
  const sites = useApi<Sourced<SolarSite>>('/api/calgary/solar/top-sites?limit=8')
  const rows = monthly.data?.rows ?? []
  const last12 = rows.slice(-12).reduce((sum, r) => sum + r.kwh, 0)

  return (
    <div className="space-y-6">
      <PageHeader title="Calgary community" subtitle="Local open data from the City of Calgary. Swap in the dataset that fits your idea." />

      <section aria-label="Solar summary" className="grid gap-4 sm:grid-cols-2">
        <StatCard label="City solar, last 12 months" value={fmtNumber(last12 / 1000)} unit="MWh" icon={<Sun className="size-5" />} tone="accent" />
        <StatCard label="Reporting city sites" value={fmtNumber(rows.at(-1)?.sites)} icon={<Lightbulb className="size-5" />} hint={rows.at(-1) ? `As of ${fmtMonth(rows.at(-1)!.period)}` : undefined} />
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <ChartCard title="Solar produced at City facilities" description="Monthly total (kWh)" source={monthly.data?.source} sourceUrl={monthly.data?.source_url}
          rows={rows} columns={[
            { key: 'period', label: 'Month', format: (r) => fmtMonth(r.period) },
            { key: 'kwh', label: 'kWh', format: (r) => fmtNumber(r.kwh) },
            { key: 'sites', label: 'Sites' },
          ]}>
          {monthly.error ? <ErrorState message={monthly.error.message} onRetry={monthly.reload} /> : monthly.loading ? <Loading /> : (
            <ResponsiveContainer>
              <BarChart data={rows}>
                <CartesianGrid {...chartTheme.grid} vertical={false} />
                <XAxis dataKey="period" tickFormatter={fmtMonth} {...chartTheme.axis} minTickGap={20} />
                <YAxis {...chartTheme.axis} width={70} tickFormatter={(v) => fmtNumber(Number(v) / 1000) + 'k'} />
                <Tooltip {...chartTheme.tooltip} cursor={{ fill: 'var(--surface-2)' }} labelFormatter={(l) => fmtMonth(String(l))} formatter={(v) => [`${fmtNumber(Number(v))} kWh`, 'Solar']} />
                <Bar dataKey="kwh" fill={chartTheme.colors[1]} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <Card aria-labelledby="top-sites">
          <h2 id="top-sites" className="mb-4 text-lg font-extrabold">Top solar sites (all time)</h2>
          {sites.error ? <ErrorState message={sites.error.message} onRetry={sites.reload} /> : sites.loading ? <Loading /> : (
            <ol className="space-y-3">
              {sites.data?.rows.map((s, i) => (
                <li key={s.name} className="flex items-center gap-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-sm font-extrabold text-accent-strong">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">{s.name}</p>
                    <p className="truncate text-sm text-muted">{s.address}</p>
                  </div>
                  <span className="text-sm font-bold tabular-nums">{fmtNumber(s.kwh / 1000)} MWh</span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>
    </div>
  )
}
