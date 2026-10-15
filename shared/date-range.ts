// Date ranges for filters and exports: presets people think in, resolved to from/to (YYYY-MM-DD, inclusive).
export const RANGE_PRESETS = [['this_month', 'This month'], ['last_month', 'Last month'], ['this_quarter', 'This quarter'], ['last_quarter', 'Last quarter'], ['ytd', 'This year'], ['last_year', 'Last year'], ['last_12', 'Last 12 months'], ['all', 'All time'], ['custom', 'Custom dates']] as const
export type RangePreset = typeof RANGE_PRESETS[number][0]
const iso = (d: Date) => d.toISOString().slice(0, 10)
const ymd = (y: number, m: number, d: number) => iso(new Date(Date.UTC(y, m, d)))
export function resolveRange(p: RangePreset, today = new Date(), custom?: { from?: string; to?: string }): { from: string; to: string } {
  const y = today.getUTCFullYear(), m = today.getUTCMonth(), q = Math.floor(m / 3) * 3
  switch (p) {
    case 'this_month': return { from: ymd(y, m, 1), to: ymd(y, m + 1, 0) }
    case 'last_month': return { from: ymd(y, m - 1, 1), to: ymd(y, m, 0) }
    case 'this_quarter': return { from: ymd(y, q, 1), to: ymd(y, q + 3, 0) }
    case 'last_quarter': return { from: ymd(y, q - 3, 1), to: ymd(y, q, 0) }
    case 'ytd': return { from: ymd(y, 0, 1), to: ymd(y, 11, 31) }
    case 'last_year': return { from: ymd(y - 1, 0, 1), to: ymd(y - 1, 11, 31) }
    case 'last_12': return { from: ymd(y, m - 11, 1), to: ymd(y, m + 1, 0) }
    case 'all': return { from: '2000-01-01', to: '2099-12-31' }
    default: return { from: custom?.from || ymd(y, m, 1), to: custom?.to || iso(today) }
  }
}
export const rangeLabel = (p: RangePreset, r: { from: string; to: string }) => (p === 'all' ? 'All time' : p === 'custom' ? r.from + ' to ' + r.to : RANGE_PRESETS.find((x) => x[0] === p)![1])
export const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
