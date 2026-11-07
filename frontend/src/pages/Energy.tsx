import { useState } from 'react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from 'recharts'
import { ArrowLeftRight, Factory, Gauge, Leaf, RefreshCw } from 'lucide-react'
import { ChartCard, chartTheme } from '../components/ChartCard'
import { Button, Card, ErrorState, Loading, PageHeader, Segmented, StatCard } from '../components/ui'
import { useApi } from '../hooks/useApi'
import { fmtHour, fmtMoney, fmtNumber, fmtTime } from '../lib/format'
import type { CurrentSupplyDemand, MlForecast, PoolPriceRow, Sourced } from '../lib/types'

export default function Energy() {
  const [days, setDays] = useState(7)
  const csd = useApi<CurrentSupplyDemand>('/api/energy/current', { refreshMs: 60_000 })
  const price = useApi<Sourced<PoolPriceRow>>(`/api/energy/pool-price?days=${days}`)
  const ml = useApi<MlForecast>('/api/ml/forecast')

  const s = csd.data?.summary
  const generation = [...(csd.data?.generation ?? [])].sort((a, b) => (b.net_generation_mw ?? 0) - (a.net_generation_mw ?? 0))

  const forecastRows = [
    ...(ml.data?.history ?? []).map((r) => ({ time: r.time, actual: r.ail_mw, predicted: null as number | null })),
    ...(ml.data?.forecast ?? []).map((r) => ({ time: r.time, actual: null as number | null, predicted: r.predicted_ail_mw })),
  ]

  return (
    <div className="space-y-6">
      <PageHeader title="Alberta energy, live" subtitle={csd.data?.last_update ? `AESO grid data · updated ${csd.data.last_update}` : 'Real data from the Alberta Electric System Operator'}
        actions={<Button variant="secondary" onClick={() => { csd.reload(); price.reload() }}><RefreshCw className="size-4" aria-hidden /> Refresh</Button>} />

      {csd.error ? <Card><ErrorState message={csd.error.message} onRetry={csd.reload} /></Card> : (
        <section aria-label="Grid summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Alberta Internal Load" value={fmtNumber(s?.alberta_internal_load_ail)} unit="MW" icon={<Gauge className="size-5" />} />
          <StatCard label="Total net generation" value={fmtNumber(s?.alberta_total_net_generation)} unit="MW" icon={<Factory className="size-5" />} tone="pink" />
          <StatCard label="Renewable share" value={fmtNumber(csd.data?.renewable_share_pct, 1)} unit="%" icon={<Leaf className="size-5" />} tone="accent" />
          <StatCard label="Net interchange" value={fmtNumber(s?.net_actual_interchange)} unit="MW" icon={<ArrowLeftRight className="size-5" />}
            hint="Positive = importing from BC / MT / SK" />
        </section>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <ChartCard title="Generation by fuel type" description="What is powering Alberta right now (MW)"
          source={csd.data?.source} sourceUrl={csd.data?.source_url} rows={generation}
          columns={[
            { key: 'fuel', label: 'Fuel' },
            { key: 'net_generation_mw', label: 'Generating (MW)', format: (r) => fmtNumber(r.net_generation_mw) },
            { key: 'max_capability_mw', label: 'Capacity (MW)', format: (r) => fmtNumber(r.max_capability_mw) },
          ]}>
          {csd.loading && !csd.data ? <Loading /> : (
            <ResponsiveContainer>
              <BarChart data={generation} layout="vertical" margin={{ left: 40 }}>
                <CartesianGrid {...chartTheme.grid} horizontal={false} />
                <XAxis type="number" {...chartTheme.axis} />
                <YAxis type="category" dataKey="fuel" {...chartTheme.axis} width={110} />
                <Tooltip {...chartTheme.tooltip} cursor={{ fill: 'var(--surface-2)' }} formatter={(v) => [`${fmtNumber(Number(v))} MW`, 'Generating']} />
                <Bar dataKey="net_generation_mw" fill={chartTheme.colors[0]} radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Pool price" description="Hourly wholesale electricity price ($/MWh)"
          source={price.data?.source} sourceUrl={price.data?.source_url} rows={price.data?.rows ?? []}
          actions={<Segmented label="Time range" value={days} onChange={setDays} options={[{ value: 1, label: '1D' }, { value: 7, label: '7D' }, { value: 30, label: '30D' }]} />}
          columns={[
            { key: 'time', label: 'Hour', format: (r) => fmtHour(r.time) },
            { key: 'price', label: 'Price', format: (r) => fmtMoney(r.price) },
            { key: 'ail_mw', label: 'Demand (MW)', format: (r) => fmtNumber(r.ail_mw) },
          ]}>
          {price.error ? <ErrorState message={price.error.message} onRetry={price.reload} /> : price.loading && !price.data ? <Loading /> : (
            <ResponsiveContainer>
              <AreaChart data={price.data?.rows ?? []}>
                <defs>
                  <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={chartTheme.colors[0]} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={chartTheme.colors[0]} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...chartTheme.grid} vertical={false} />
                <XAxis dataKey="time" tickFormatter={fmtHour} {...chartTheme.axis} minTickGap={40} />
                <YAxis {...chartTheme.axis} width={50} />
                <Tooltip {...chartTheme.tooltip} labelFormatter={(l) => fmtTime(String(l))} formatter={(v) => [fmtMoney(Number(v)), 'Price']} />
                <Area type="monotone" dataKey="price" stroke={chartTheme.colors[0]} strokeWidth={2} fill="url(#priceFill)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      <ChartCard title="Demand forecast (our ML model)" description={ml.data?.model.mape_pct != null
          ? `Next 24h Alberta load · ${ml.data.model.mape_pct}% average error on the last 30 days · ${ml.data.model.improvement_vs_baseline_pct}% better than "same as yesterday"`
          : 'Next 24 hours of Alberta Internal Load, predicted from real AESO history'}
        source="Model trained on AESO Historical Pool Price report" rows={forecastRows}
        columns={[
          { key: 'time', label: 'Hour', format: (r) => fmtHour(r.time) },
          { key: 'actual', label: 'Actual (MW)', format: (r) => fmtNumber(r.actual) },
          { key: 'predicted', label: 'Forecast (MW)', format: (r) => fmtNumber(r.predicted) },
        ]}>
        {ml.error ? <ErrorState message={ml.error.message} onRetry={ml.reload} /> : ml.loading && !ml.data ? <Loading /> : (
          <ResponsiveContainer>
            <LineChart data={forecastRows}>
              <CartesianGrid {...chartTheme.grid} vertical={false} />
              <XAxis dataKey="time" tickFormatter={fmtHour} {...chartTheme.axis} minTickGap={40} />
              <YAxis {...chartTheme.axis} width={60} domain={['auto', 'auto']} />
              <Tooltip {...chartTheme.tooltip} labelFormatter={(l) => fmtTime(String(l))} formatter={(v, n) => [`${fmtNumber(Number(v))} MW`, n]} />
              <Legend />
              <Line type="monotone" dataKey="actual" name="Actual" stroke={chartTheme.colors[0]} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="predicted" name="Forecast" stroke={chartTheme.colors[1]} strokeWidth={2.5} strokeDasharray="6 4" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </ChartCard>
    </div>
  )
}
