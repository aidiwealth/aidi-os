// Platform overview: real MRR and ARR from subscriptions, new and churned MRR this month, renewals, pipeline, customers.
export default defineEventHandler(async (event) => {
  await requirePlatform(event)
  return await asPlatform(async () => {
    const k = await one<{ total: number; active: number; trial: number; past_due: number; suspended: number; new30: number; seats: number }>(
      `SELECT count(*) FILTER (WHERE o.plan_code <> 'internal')::int AS total,
              count(*) FILTER (WHERE o.status = 'active' AND o.plan_code <> 'internal')::int AS active,
              count(*) FILTER (WHERE o.status = 'trial')::int AS trial,
              count(*) FILTER (WHERE o.status = 'past_due')::int AS past_due,
              count(*) FILTER (WHERE o.status = 'suspended')::int AS suspended,
              count(*) FILTER (WHERE o.created_at > now() - interval '30 days' AND o.plan_code <> 'internal')::int AS new30,
              (SELECT count(*)::int FROM core.memberships m JOIN core.organizations x ON x.id = m.organization_id WHERE m.status = 'active' AND x.plan_code <> 'internal' AND x.status IN ('trial','active','past_due')) AS seats
         FROM core.organizations o`)
    const m = await one<{ mrr: string; new_mrr: string; churn_mrr: string }>(
      `SELECT coalesce(sum(${MONTHLY_SQL}) FILTER (WHERE s.start_date <= current_date AND (s.ended_at IS NULL OR s.ended_at > current_date)), 0)::text AS mrr,
              coalesce(sum(${MONTHLY_SQL}) FILTER (WHERE s.start_date >= date_trunc('month', current_date) AND NOT EXISTS (
                SELECT 1 FROM platform.subscriptions x WHERE x.organization_id = s.organization_id AND x.id <> s.id AND x.ended_at = s.start_date)), 0)::text AS new_mrr,
              coalesce(sum(${MONTHLY_SQL}) FILTER (WHERE s.ended_at >= date_trunc('month', current_date) AND s.ended_at <= current_date AND s.end_reason IN ('cancelled','churned')), 0)::text AS churn_mrr
         FROM platform.subscriptions s`)
    const series = await db().query<{ b: string; v: string }>(
      `WITH months AS (SELECT (date_trunc('month', current_date) - (g || ' months')::interval)::date AS b FROM generate_series(0, 11) g)
       SELECT to_char(mo.b, 'YYYY-MM-DD') AS b, coalesce(sum(${MONTHLY_SQL}), 0)::text AS v
         FROM months mo LEFT JOIN platform.subscriptions s ON s.start_date <= (mo.b + interval '1 month - 1 day')::date AND (s.ended_at IS NULL OR s.ended_at > (mo.b + interval '1 month - 1 day')::date)
        GROUP BY mo.b ORDER BY mo.b`)
    const live = await db().query<{ id: string; customer: string; organization_id: string; start_date: string; billing: string; amount_usd: string }>(
      "SELECT s.id, o.name AS customer, s.organization_id, to_char(s.start_date, 'YYYY-MM-DD') AS start_date, s.billing, s.amount_usd::text FROM platform.subscriptions s JOIN core.organizations o ON o.id = s.organization_id WHERE s.status <> 'ended'")
    const soon = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
    const renewals = live.rows.map((s) => ({ ...s, renews: nextRenewal(s.start_date, s.billing) })).filter((s) => s.renews <= soon).sort((a, b) => a.renews.localeCompare(b.renews))
    const pipe = await one<{ open: number; value: string; weighted: string }>(
      `SELECT count(*)::int AS open, coalesce(sum(value_monthly_usd), 0)::text AS value,
              coalesce(sum(value_monthly_usd * CASE stage WHEN 'lead' THEN 0.1 WHEN 'qualified' THEN 0.25 WHEN 'demo' THEN 0.4 WHEN 'proposal' THEN 0.6 WHEN 'negotiation' THEN 0.8 ELSE 0 END), 0)::text AS weighted
         FROM platform.leads WHERE stage IN ('lead','qualified','demo','proposal','negotiation')`)
    const overdue = await one<{ n: number; v: string }>("SELECT count(*)::int AS n, coalesce(sum(amount), 0)::text AS v FROM platform.invoices WHERE status = 'sent' AND due_date < current_date")
    const byPlan = await db().query<{ plan: string; n: number }>(
      "SELECT p.name AS plan, count(o.id)::int AS n FROM core.plans p LEFT JOIN core.organizations o ON o.plan_code = p.code AND o.status IN ('trial','active','past_due') WHERE p.code <> 'internal' GROUP BY p.name, p.sort ORDER BY p.sort")
    const trials = await db().query("SELECT id, name, to_char(trial_ends_at, 'YYYY-MM-DD') AS ends FROM core.organizations WHERE status = 'trial' ORDER BY trial_ends_at NULLS LAST LIMIT 8")
    const recent = await db().query("SELECT o.id, o.name, o.status, p.name AS plan, o.created_at FROM core.organizations o JOIN core.plans p ON p.code = o.plan_code WHERE o.plan_code <> 'internal' ORDER BY o.created_at DESC LIMIT 6")
    const mrr = Number(m.mrr)
    return {
      kpis: { ...k, mrr, arr: mrr * 12, newMrr: Number(m.new_mrr), churnMrr: Number(m.churn_mrr), pipelineOpen: pipe.open, pipeline: Number(pipe.value), weighted: Number(pipe.weighted), overdueCount: overdue.n, overdue: Number(overdue.v) },
      mrrSeries: series.rows.map((r) => ({ period: r.b, value: Number(r.v) })), renewals, byPlan: byPlan.rows, trials: trials.rows, recent: recent.rows
    }
  })
})
