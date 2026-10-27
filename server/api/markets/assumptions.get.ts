// The assumptions in force (with the date each applies from and its source), what each means, and every value entered.
export default defineEventHandler(async (event) => {
  await requireMarkets(event)
  const history = (await db().query("SELECT a.key, a.value::float AS value, to_char(a.effective_date, 'YYYY-MM-DD') AS effective_date, a.source_url, a.note, a.created_at, a.set_by, CASE WHEN a.set_by = 'ai' THEN 'AI' ELSE pp.full_name END AS by FROM markets.assumptions a LEFT JOIN core.users u ON u.id = a.created_by LEFT JOIN core.people pp ON pp.id = u.person_id ORDER BY a.created_at DESC LIMIT 100")).rows
  await refreshRates()
  if (!(await marketAssumptions()).mrp_us.set) kickPremium(event)
  return { current: await marketAssumptions(), meta: MARKET_ASSUMPTIONS, history, rates: { DGS10: await latestRate('DGS10'), DTB3: await latestRate('DTB3') }, ai_on: !!useRuntimeConfig().anthropicApiKey }
})
