// Family Office analytics: the group's entities, documents, group companies (subsidiaries and affiliates) and activity.
import { z } from 'zod'
const Q = z.object({ entity: z.string().uuid().optional().or(z.literal('').transform(() => undefined)), range: z.enum(['90d', '12m', 'all']).default('12m') })
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'team', 'family')
  const q = Q.safeParse(getQuery(event))
  if (!q.success) throw apiError('invalid', 'Bad filter.')
  const { entity, range } = q.data
  const since = rangeSql(range), bucket = bucketFor(range)
  const levels = visibleLevels(user.roles)
  const ents = await db().query<{ status: string; kind: string; c: number }>('SELECT status, kind, count(*)::int AS c FROM core.entities GROUP BY status, kind')
  const byStatus: Record<string, number> = {}, byKind: Record<string, number> = {}
  for (const r of ents.rows) { byStatus[r.status] = (byStatus[r.status] ?? 0) + r.c; byKind[r.kind] = (byKind[r.kind] ?? 0) + r.c }
  const ef = entity ? 'AND d.entity_id = $2' : ''
  const docArgs = entity ? [levels, entity] : [levels]
  const docTotals = await one<{ total: number; added: number; restricted: number }>(
    `SELECT count(*)::int AS total, count(*) FILTER (WHERE d.created_at >= ${since})::int AS added, count(*) FILTER (WHERE d.sensitivity <> 'normal')::int AS restricted
       FROM core.documents d WHERE d.sensitivity = ANY($1::text[]) ${ef}`, docArgs)
  const docByEntity = await db().query<{ name: string; c: number }>(
    `SELECT coalesce(e.name, 'Not tagged') AS name, count(*)::int AS c FROM core.documents d LEFT JOIN core.entities e ON e.id = d.entity_id
      WHERE d.sensitivity = ANY($1::text[]) ${ef} GROUP BY 1 ORDER BY 2 DESC LIMIT 8`, docArgs)
  const docSeries = await db().query<{ b: string; v: number }>(
    `SELECT to_char(date_trunc('${bucket}', d.created_at), 'YYYY-MM-DD') AS b, count(*)::int AS v FROM core.documents d
      WHERE d.sensitivity = ANY($1::text[]) AND d.created_at >= ${since} ${ef} GROUP BY 1 ORDER BY 1`, docArgs)
  // Group companies: portfolio companies the group owns (subsidiary) or holds strategically (affiliate)
  const cf = entity ? 'AND c.holding_entity_id = $1' : ''
  const cArgs = entity ? [entity] : []
  const cos = await db().query<{ id: string; name: string; relationship: string; holder: string | null; revenue: string | null; cash: string | null; burn: string | null }>(
    `SELECT c.id, c.name, c.relationship, he.name AS holder,
            (SELECT coalesce(override_value, founder_value)::text FROM portfolio.metric_values WHERE company_id = c.id AND metric = 'revenue' AND coalesce(override_value, founder_value) IS NOT NULL ORDER BY period DESC LIMIT 1) AS revenue,
            (SELECT coalesce(override_value, founder_value)::text FROM portfolio.metric_values WHERE company_id = c.id AND metric = 'cash' AND coalesce(override_value, founder_value) IS NOT NULL ORDER BY period DESC LIMIT 1) AS cash,
            (SELECT coalesce(override_value, founder_value)::text FROM portfolio.metric_values WHERE company_id = c.id AND metric = 'net_burn' AND coalesce(override_value, founder_value) IS NOT NULL ORDER BY period DESC LIMIT 1) AS burn
       FROM portfolio.companies c LEFT JOIN core.entities he ON he.id = c.holding_entity_id
      WHERE c.active AND c.relationship IN ('subsidiary','affiliate') ${cf} ORDER BY c.name`, cArgs)
  const revSeries = await db().query<{ b: string; v: string }>(
    `SELECT to_char(m.period, 'YYYY-MM-DD') AS b, sum(coalesce(m.override_value, m.founder_value))::text AS v
       FROM portfolio.metric_values m JOIN portfolio.companies c ON c.id = m.company_id
      WHERE c.active AND c.relationship IN ('subsidiary','affiliate') AND m.metric = 'revenue' AND m.period >= date_trunc('month', now() - interval '12 months') ${cf}
      GROUP BY 1 ORDER BY 1`, cArgs)
  const held = await db().query<{ name: string; c: number }>(
    `SELECT e.name, count(*)::int AS c FROM portfolio.companies c JOIN core.entities e ON e.id = c.holding_entity_id WHERE c.active GROUP BY 1 ORDER BY 2 DESC LIMIT 8`)
  const act = await db().query<{ b: string; v: number }>(
    `SELECT to_char(date_trunc('${bucket}', at), 'YYYY-MM-DD') AS b, count(*)::int AS v FROM core.audit_log
      WHERE at >= ${since} AND actor_user_id IS NOT NULL ${entity ? 'AND entity_id = $1' : ''} GROUP BY 1 ORDER BY 1`, entity ? [entity] : [])
  const n = (v: string | null) => (v === null ? 0 : Number(v))
  return {
    range, bucket,
    entities: { byStatus, byKind },
    documents: { ...docTotals, byEntity: docByEntity.rows, series: fillSeries(docSeries.rows, seriesKeys(range, bucket, docSeries.rows[0]?.b)) },
    groupCompanies: {
      count: cos.rows.length, subsidiaries: cos.rows.filter((c) => c.relationship === 'subsidiary').length, affiliates: cos.rows.filter((c) => c.relationship === 'affiliate').length,
      revenue: cos.rows.reduce((s, c) => s + n(c.revenue), 0), cash: cos.rows.reduce((s, c) => s + n(c.cash), 0),
      list: cos.rows.map((c) => ({ id: c.id, name: c.name, relationship: c.relationship, holder: c.holder, revenue: c.revenue === null ? null : Number(c.revenue), runway: c.cash !== null && c.burn !== null && Number(c.burn) > 0 ? Number(c.cash) / Number(c.burn) : null })),
      revenueSeries: revSeries.rows.map((r) => ({ period: r.b, value: Number(r.v) }))
    },
    heldByEntity: held.rows,
    activity: fillSeries(act.rows, seriesKeys(range, bucket, act.rows[0]?.b))
  }
})
