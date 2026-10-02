// The monthly metrics founders report, and helpers shared by the founder link and the internal pages.
export const METRICS = [
  { key: 'revenue', label: 'Revenue this month', unit: 'usd', hint: 'Total revenue recognised in the month' },
  { key: 'gross_margin', label: 'Gross margin', unit: 'pct', hint: 'As a percentage, e.g. 62' },
  { key: 'net_burn', label: 'Net burn this month', unit: 'usd', hint: 'Cash out minus cash in; 0 if cash-flow positive' },
  { key: 'cash', label: 'Cash in the bank', unit: 'usd', hint: 'At month end' },
  { key: 'customers', label: 'Paying customers', unit: 'count', hint: 'At month end' },
  { key: 'headcount', label: 'Headcount', unit: 'count', hint: 'Full-time equivalents' }
] as const
export const METRIC_KEYS = ['revenue', 'gross_margin', 'net_burn', 'cash', 'customers', 'headcount'] as const
export type MetricKey = typeof METRIC_KEYS[number]

// 'YYYY-MM' <-> first-of-month date string
export const periodToDate = (p: string): string => p + '-01'
export const isPeriod = (p: string): boolean => /^20\d\d-(0[1-9]|1[0-2])$/.test(p)
export function periodLabel(d: string): string {
  const [y, m] = d.slice(0, 7).split('-').map(Number)
  return new Date(Date.UTC(y!, m! - 1, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}
