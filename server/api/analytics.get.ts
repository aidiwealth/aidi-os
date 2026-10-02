// Analytics for the venture and family-office modules that are switched on. Filters: ?entity=<uuid>&range=90d|12m|all
import { z } from 'zod'
const Q = z.object({ entity: z.string().uuid().optional().or(z.literal('').transform(() => undefined)), range: z.enum(['90d', '12m', 'all']).default('12m') })
const n = (v: unknown) => (v === null || v === undefined ? 0 : Number(v))

// Every week or month in the range, so charts show a continuous line (zeros where nothing happened)
function bucketKeys(range: string, bucket: 'week' | 'month', first?: string): string[] {
  const now = new Date()
  const startOf = (d: Date) => bucket === 'month' ? new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
    : new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7)))
  let s = range === '90d' ? new Date(now.getTime() - 90 * 86400000) : range === '12m' ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1)) : first ? new Date(first + 'T00:00:00Z') : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1))
  s = startOf(s)
  const keys: string[] = []
  for (let d = s; d <= now && keys.length < 400; d = bucket === 'month' ? new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)) : new Date(d.getTime() + 7 * 86400000)) keys.push(d.toISOString().slice(0, 10))
  return keys
}
function fill(rows: { period: string; value: number }[], keys: string[], carry = false): { period: string; value: number }[] {
  const m = new Map(rows.map((r) => [r.period, r.value]))
  let last = 0
  return keys.map((k) => { const v = m.get(k); if (v !== undefined) last = v; return { period: k, value: v ?? (carry ? last : 0) } })
}

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'team', 'family')
  const q = Q.safeParse(getQuery(event))
  if (!q.success) throw apiError('invalid', 'Bad filter.')
  const { entity, range } = q.data
  const since = range === '90d' ? "now() - interval '90 days'" : range === '12m' ? "now() - interval '12 months'" : "'-infinity'::timestamptz"
  const bucket = range === '90d' ? 'week' : 'month'
  const on = await enabledModules()
  const vc = canUse(MODULES.find((m) => m.code === 'pipeline')!, user.roles)
  const out: Record<string, unknown> = { range, entity: entity ?? null, bucket }

  if (vc && on.has('pitches')) {
    const p = await one<{ received: number; avg_score: string | null; decided: number; advanced: number; median_days: string | null }>(
      `SELECT (SELECT count(*)::int FROM deals.pitches WHERE received_at >= ${since} AND status <> 'spam') AS received,
              (SELECT avg(s.score)::numeric(10,1) FROM deals.screenings s JOIN deals.pitches p ON p.id = s.pitch_id WHERE p.received_at >= ${since}) AS avg_score,
              (SELECT count(DISTINCT d.pitch_id)::int FROM deals.decisions d JOIN deals.pitches p ON p.id = d.pitch_id WHERE p.received_at >= ${since}) AS decided,
              (SELECT count(DISTINCT d.pitch_id)::int FROM deals.decisions d JOIN deals.pitches p ON p.id = d.pitch_id WHERE p.received_at >= ${since} AND d.decision = 'advance') AS advanced,
              (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM (fd.first - p.received_at)) / 86400)::numeric(10,1)
                 FROM deals.pitches p JOIN (SELECT pitch_id, min(decided_at) AS first FROM deals.decisions GROUP BY pitch_id) fd ON fd.pitch_id = p.id
                WHERE p.received_at >= ${since}) AS median_days`)
    const series = await db().query<{ b: string; c: number }>(
      `SELECT to_char(date_trunc('${bucket}', received_at), 'YYYY-MM-DD') AS b, count(*)::int AS c FROM deals.pitches
        WHERE received_at >= ${since} AND status <> 'spam' GROUP BY 1 ORDER BY 1`)
    out.pitches = { received: p.received, avgScore: p.avg_score === null ? null : Number(p.avg_score), decided: p.decided, advanceRate: p.decided ? Math.round((p.advanced / p.decided) * 100) : null, medianDaysToDecision: p.median_days === null ? null : Number(p.median_days), series: fill(series.rows.map((r) => ({ period: r.b, value: r.c })), bucketKeys(range, bucket, series.rows[0]?.b)) }
  }

  if (vc && on.has('pipeline')) {
    const ef = entity ? 'AND d.vehicle_entity_id = $1' : ''
    const args = entity ? [entity] : []
    const st = await db().query<{ stage: string; c: number }>(`SELECT d.stage, count(*)::int AS c FROM deals.deals d WHERE true ${ef} GROUP BY d.stage`, args)
    const inv = await one<{ count: number; deployed: string | null; avg_check: string | null; median_val: string | null }>(
      `SELECT count(*)::int AS count, sum(d.check_usd)::text AS deployed, avg(d.check_usd)::numeric(16,0)::text AS avg_check,
              percentile_cont(0.5) WITHIN GROUP (ORDER BY d.valuation_usd)::numeric(16,0)::text AS median_val
         FROM deals.deals d WHERE d.stage = 'invested' AND coalesce(d.closed_at, d.created_at) >= ${since} ${ef}`, args)
    const dep = await db().query<{ b: string; v: string }>(
      `SELECT to_char(date_trunc('month', coalesce(d.closed_at, d.created_at)), 'YYYY-MM-DD') AS b, sum(coalesce(d.check_usd, 0))::text AS v
         FROM deals.deals d WHERE d.stage = 'invested' AND coalesce(d.closed_at, d.created_at) >= ${since} ${ef} GROUP BY 1 ORDER BY 1`, args)
    let cum = 0
    const byStage = Object.fromEntries(st.rows.map((r) => [r.stage, r.c]))
    const active = ['screening', 'first_call', 'diligence', 'ic'].reduce((s, k) => s + n(byStage[k]), 0)
    const closed = n(byStage.invested) + n(byStage.passed)
    out.pipeline = {
      byStage, active, winRate: closed ? Math.round((n(byStage.invested) / closed) * 100) : null,
      invested: inv.count, deployed: n(inv.deployed), avgCheck: inv.avg_check === null ? null : Number(inv.avg_check), medianValuation: inv.median_val === null ? null : Number(inv.median_val),
      deployedSeries: fill(dep.rows.map((r) => { cum += Number(r.v); return { period: r.b, value: cum } }), bucketKeys(range, 'month', dep.rows[0]?.b), true)
    }
  }

  if (vc && on.has('portfolio')) {
    const ef = entity ? 'AND c.holding_entity_id = $1' : ''
    const args = entity ? [entity] : []
    const rev = await db().query<{ period: string; v: string }>(
      `SELECT to_char(m.period, 'YYYY-MM-DD') AS period, sum(coalesce(m.override_value, m.founder_value))::text AS v
         FROM portfolio.metric_values m JOIN portfolio.companies c ON c.id = m.company_id
        WHERE c.active AND m.metric = 'revenue' AND m.period >= date_trunc('month', ${since === "'-infinity'::timestamptz" ? "'1900-01-01'::date" : since}) ${ef}
        GROUP BY 1 ORDER BY 1`, args)
    const latest = await db().query<{ id: string; name: string; cash: string | null; burn: string | null; revenue: string | null }>(
      `SELECT c.id, c.name,
              (SELECT coalesce(override_value, founder_value)::text FROM portfolio.metric_values WHERE company_id = c.id AND metric = 'cash' AND coalesce(override_value, founder_value) IS NOT NULL ORDER BY period DESC LIMIT 1) AS cash,
              (SELECT coalesce(override_value, founder_value)::text FROM portfolio.metric_values WHERE company_id = c.id AND metric = 'net_burn' AND coalesce(override_value, founder_value) IS NOT NULL ORDER BY period DESC LIMIT 1) AS burn,
              (SELECT coalesce(override_value, founder_value)::text FROM portfolio.metric_values WHERE company_id = c.id AND metric = 'revenue' AND coalesce(override_value, founder_value) IS NOT NULL ORDER BY period DESC LIMIT 1) AS revenue
         FROM portfolio.companies c WHERE c.active ${ef}`, args)
    const lastMonth = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 1, 1)).toISOString().slice(0, 10)
    const rep = await one<{ asked: number; submitted: number }>(
      `SELECT count(*)::int AS asked, count(*) FILTER (WHERE r.status = 'submitted')::int AS submitted
         FROM (SELECT DISTINCT ON (r.company_id) r.company_id, r.status FROM portfolio.requests r JOIN portfolio.companies c ON c.id = r.company_id
                WHERE r.period = $${entity ? 2 : 1}::date ${ef} ORDER BY r.company_id, r.sent_at DESC) r`, entity ? [entity, lastMonth] : [lastMonth])
    const runways = latest.rows.filter((r) => r.cash !== null && r.burn !== null && Number(r.burn) > 0).map((r) => ({ id: r.id, name: r.name, months: Number(r.cash) / Number(r.burn) }))
    const sorted = [...runways].sort((a, b) => a.months - b.months)
    out.portfolio = {
      companies: latest.rows.length,
      totalCash: latest.rows.reduce((s, r) => s + n(r.cash), 0),
      latestRevenue: latest.rows.reduce((s, r) => s + n(r.revenue), 0),
      medianRunway: sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)]!.months : null,
      atRisk: sorted.filter((r) => r.months < 6),
      reporting: { month: lastMonth, asked: rep.asked, submitted: rep.submitted },
      revenueSeries: rev.rows.map((r) => ({ period: r.period, value: Number(r.v) }))
    }
  }

  if (on.has('entities') || on.has('documents')) {
    const levels = visibleLevels(user.roles)
    const ents = await db().query<{ status: string; c: number }>('SELECT status, count(*)::int AS c FROM core.entities GROUP BY status')
    const docs = await db().query<{ name: string; c: number }>(
      `SELECT coalesce(e.name, 'Not tagged') AS name, count(*)::int AS c FROM core.documents d LEFT JOIN core.entities e ON e.id = d.entity_id
        WHERE d.sensitivity = ANY($1::text[]) ${entity ? 'AND d.entity_id = $2' : ''} GROUP BY 1 ORDER BY 2 DESC LIMIT 8`, entity ? [levels, entity] : [levels])
    const act = await db().query<{ b: string; c: number }>(
      `SELECT to_char(date_trunc('${bucket}', at), 'YYYY-MM-DD') AS b, count(*)::int AS c FROM core.audit_log
        WHERE at >= ${since} AND actor_user_id IS NOT NULL ${entity ? 'AND entity_id = $1' : ''} GROUP BY 1 ORDER BY 1`, entity ? [entity] : [])
    out.office = {
      entities: Object.fromEntries(ents.rows.map((r) => [r.status, r.c])),
      documentsByEntity: docs.rows, activitySeries: fill(act.rows.map((r) => ({ period: r.b, value: r.c })), bucketKeys(range, bucket, act.rows[0]?.b))
    }
  }
  return out
})
