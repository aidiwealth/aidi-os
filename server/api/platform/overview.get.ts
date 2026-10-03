// Platform overview: customers by status and plan, seats, monthly recurring revenue at list price, trials ending, sign-ups.
export default defineEventHandler(async (event) => {
  await requirePlatform(event)
  return await asPlatform(async () => {
    const k = await one<{ total: number; active: number; trial: number; past_due: number; suspended: number; new30: number; seats: number; mrr: string }>(
      `SELECT count(*) FILTER (WHERE o.plan_code <> 'internal')::int AS total,
              count(*) FILTER (WHERE o.status = 'active' AND o.plan_code <> 'internal')::int AS active,
              count(*) FILTER (WHERE o.status = 'trial')::int AS trial,
              count(*) FILTER (WHERE o.status = 'past_due')::int AS past_due,
              count(*) FILTER (WHERE o.status = 'suspended')::int AS suspended,
              count(*) FILTER (WHERE o.created_at > now() - interval '30 days' AND o.plan_code <> 'internal')::int AS new30,
              (SELECT count(*)::int FROM core.memberships m JOIN core.organizations x ON x.id = m.organization_id WHERE m.status = 'active' AND x.plan_code <> 'internal' AND x.status IN ('trial','active','past_due')) AS seats,
              coalesce(sum(p.price_monthly_usd) FILTER (WHERE o.status IN ('active','past_due') AND o.plan_code <> 'internal'), 0)::text AS mrr
         FROM core.organizations o JOIN core.plans p ON p.code = o.plan_code`)
    const byPlan = await db().query<{ plan: string; n: number }>(
      "SELECT p.name AS plan, count(o.id)::int AS n FROM core.plans p LEFT JOIN core.organizations o ON o.plan_code = p.code AND o.status IN ('trial','active','past_due') WHERE p.code <> 'internal' GROUP BY p.name, p.sort ORDER BY p.sort")
    const trials = await db().query("SELECT id, name, to_char(trial_ends_at, 'YYYY-MM-DD') AS ends FROM core.organizations WHERE status = 'trial' ORDER BY trial_ends_at NULLS LAST LIMIT 8")
    const recent = await db().query("SELECT o.id, o.name, o.status, p.name AS plan, o.created_at FROM core.organizations o JOIN core.plans p ON p.code = o.plan_code WHERE o.plan_code <> 'internal' ORDER BY o.created_at DESC LIMIT 6")
    const series = await db().query<{ b: string; v: number }>(
      "SELECT to_char(date_trunc('month', created_at), 'YYYY-MM-DD') AS b, count(*)::int AS v FROM core.organizations WHERE plan_code <> 'internal' AND created_at > now() - interval '12 months' GROUP BY 1 ORDER BY 1")
    return { kpis: { ...k, mrr: Number(k.mrr) }, byPlan: byPlan.rows, trials: trials.rows, recent: recent.rows, signups: fillSeries(series.rows, seriesKeys('12m', 'month')) }
  })
})
