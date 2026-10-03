export default defineEventHandler(async (event) => {
  await requirePlatform(event)
  const r = await asPlatform(() => db().query(
    `SELECT p.code, p.name, p.description, p.modules, p.seat_limit, p.storage_gb, p.ai_runs_month, p.price_monthly_usd::text AS price_monthly, p.price_annual_usd::text AS price_annual,
            p.public, p.active, p.sort, (SELECT count(*)::int FROM core.organizations o WHERE o.plan_code = p.code AND o.status IN ('trial','active','past_due')) AS customers
       FROM core.plans p ORDER BY p.sort, p.code`))
  return { plans: r.rows, modules: MODULES.filter((m) => m.switchable).map((m) => ({ code: m.code, label: m.label === 'Analytics' ? GROUP_LABEL[m.group] + ' analytics' : m.label, group: GROUP_LABEL[m.group] })) }
})
