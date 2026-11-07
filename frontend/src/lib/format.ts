const TZ = 'America/Edmonton'

export const fmtNumber = (n: number | null | undefined, digits = 0) =>
  n == null ? '–' : n.toLocaleString('en-CA', { maximumFractionDigits: digits, minimumFractionDigits: digits })

export const fmtMoney = (n: number | null | undefined) =>
  n == null ? '–' : n.toLocaleString('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 2 })

export const fmtHour = (iso: string) =>
  new Date(iso).toLocaleString('en-CA', { timeZone: TZ, month: 'short', day: 'numeric', hour: 'numeric' })

export const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString('en-CA', { timeZone: TZ, dateStyle: 'medium', timeStyle: 'short' })

export const fmtMonth = (period: string) => {
  const [y, m] = period.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleString('en-CA', { month: 'short', year: '2-digit' })
}
