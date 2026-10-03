// Chart helpers: every week or month in the range, so lines are continuous (zeros where nothing happened).
export type Range = '90d' | '12m' | 'all'
export const rangeSql = (r: Range): string => r === '90d' ? "now() - interval '90 days'" : r === '12m' ? "now() - interval '12 months'" : "'-infinity'::timestamptz"
export const bucketFor = (r: Range): 'week' | 'month' => (r === '90d' ? 'week' : 'month')
export function seriesKeys(range: Range, bucket: 'week' | 'month', first?: string): string[] {
  const now = new Date()
  const startOf = (d: Date) => bucket === 'month' ? new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
    : new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7)))
  let s = range === '90d' ? new Date(now.getTime() - 90 * 86400000) : range === '12m' ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1)) : first ? new Date(first + 'T00:00:00Z') : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1))
  s = startOf(s)
  const keys: string[] = []
  for (let d = s; d <= now && keys.length < 400; d = bucket === 'month' ? new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)) : new Date(d.getTime() + 7 * 86400000)) keys.push(d.toISOString().slice(0, 10))
  return keys
}
export function fillSeries(rows: { b: string; v: number | string }[], keys: string[]): { period: string; value: number }[] {
  const m = new Map(rows.map((r) => [r.b, Number(r.v)]))
  return keys.map((k) => ({ period: k, value: m.get(k) ?? 0 }))
}
