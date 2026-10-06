export default defineEventHandler(async (event) => {
  await requireOperator(event)
  const job = String(getRouterParam(event, 'job') ?? '')
  if (!/^[0-9a-f-]{36}$/.test(job)) throw apiError('not_found', 'Not found', 404)
  return (await db().query('SELECT id, status, currency, target::float, round, instrument, valuation::float, fee_pct::float, intake, intake_at FROM services.raise_programs WHERE job_id = $1', [job])).rows[0] ?? null
})
