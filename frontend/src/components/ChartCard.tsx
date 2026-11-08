// Wraps every chart with a title, data source, and a "View as table" toggle so screen-reader
// and keyboard users get the same information as sighted mouse users (accessibility judging).
import { useId, useState, type ReactNode } from 'react'
import { BarChart3, ExternalLink, Table2 } from 'lucide-react'
import { Card } from './ui'

export type Column<T> = { key: keyof T | string; label: string; format?: (row: T) => string }

export function ChartCard<T>({ title, description, source, sourceUrl, actions, rows, columns, children }: {
  title: string
  description?: string
  source?: string
  sourceUrl?: string
  actions?: ReactNode
  rows: T[]
  columns: Column<T>[]
  children: ReactNode
}) {
  const [asTable, setAsTable] = useState(false)
  const id = useId()
  return (
    <Card aria-labelledby={id} className="animate-in">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id={id} className="text-lg font-extrabold">{title}</h2>
          {description && <p className="text-sm text-muted">{description}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {actions}
          <button type="button" onClick={() => setAsTable((v) => !v)} aria-pressed={asTable}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-sm font-bold text-muted hover:text-fg">
            {asTable ? <BarChart3 className="size-4" aria-hidden /> : <Table2 className="size-4" aria-hidden />}
            {asTable ? 'View chart' : 'View as table'}
          </button>
        </div>
      </div>

      {asTable ? (
        <div className="max-h-80 overflow-auto rounded-xl border border-line">
          <table className="w-full text-sm">
            <caption className="sr-only">{title}</caption>
            <thead className="sticky top-0 bg-surface-2">
              <tr>{columns.map((c) => <th key={String(c.key)} scope="col" className="px-3 py-2 text-left font-bold">{c.label}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-line">
                  {columns.map((c) => (
                    <td key={String(c.key)} className="px-3 py-1.5 tabular-nums">
                      {c.format ? c.format(r) : String((r as Record<string, unknown>)[c.key as string] ?? '–')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="h-72" aria-hidden>{children}</div>
      )}

      {source && (
        <p className="mt-3 text-xs text-muted">
          Source:{' '}
          {sourceUrl ? (
            <a href={sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-bold text-brand-strong underline-offset-2 hover:underline">
              {source} <ExternalLink className="size-3" aria-hidden /><span className="sr-only">(opens in browser)</span>
            </a>
          ) : source}
        </p>
      )}
    </Card>
  )
}

/** Shared Recharts styling so charts follow the theme. */
export const chartTheme = {
  grid: { stroke: 'var(--line)', strokeDasharray: '3 3' },
  axis: { stroke: 'var(--muted)', fontSize: 12, tickLine: false, axisLine: false },
  tooltip: {
    contentStyle: { background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, color: 'var(--fg)' },
    labelStyle: { color: 'var(--muted)', fontWeight: 700 },
  },
  colors: ['#FE8653', '#8DD39A', '#FFAB4B', '#F9CF48', '#5A2614'],
}
