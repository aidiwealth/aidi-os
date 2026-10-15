// Combined portfolio revenue per month, the way partners read it: for each month, every company's latest reported monthly
// revenue (a quarter counts a third per month), carried forward until it is more than STALE_MONTHS old. Companies report
// at different times, so a plain sum by calendar month dips whenever someone has not reported yet; this does not, and the
// latest point is the same number as the "latest, combined" tile.
import type { Range } from '~/server/utils/series'
export const STALE_MONTHS = 6
export async function revenueRunRate(o: { filter?: string; args?: unknown[]; range?: Range } = {}): Promise<{ series: { period: string; value: number; companies: number }[]; latest: number; companies: number }> {
  const args = o.args ?? [], f = o.filter ?? ''
  const base = `SELECT m.company_id, m.period, coalesce(m.override_value, m.founder_value) AS v FROM portfolio.metric_months m JOIN portfolio.companies c ON c.id = m.company_id
     WHERE c.active AND m.metric = 'revenue' AND coalesce(m.override_value, m.founder_value) IS NOT NULL ${f}`
  const first = (await db().query<{ p: string | null }>(`SELECT to_char(min(period), 'YYYY-MM-DD') AS p FROM (${base}) r`, args)).rows[0]?.p ?? undefined
  const keys = seriesKeys(o.range ?? '12m', 'month', first)
  if (!keys.length) return { series: [], latest: 0, companies: 0 }
  const r = await db().query<{ b: string; v: string; n: number }>(
    `WITH r AS (${base}), mm AS (SELECT unnest($${args.length + 1}::date[]) AS m)
     SELECT to_char(mm.m, 'YYYY-MM-DD') AS b, coalesce(sum(x.v), 0)::text AS v, count(x.v)::int AS n
       FROM mm LEFT JOIN LATERAL (SELECT DISTINCT ON (r.company_id) r.v FROM r WHERE r.period <= mm.m AND r.period > (mm.m - make_interval(months => ${STALE_MONTHS}))::date ORDER BY r.company_id, r.period DESC) x ON true
      GROUP BY mm.m ORDER BY mm.m`, [...args, keys])
  const series = r.rows.map((x) => ({ period: x.b, value: Number(x.v), companies: x.n }))
  const last = series[series.length - 1]
  return { series, latest: last?.value ?? 0, companies: last?.companies ?? 0 }
}
