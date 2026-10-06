// Latest daily exchange rates (units per US dollar), for showing combined totals. Reporting only.
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin', 'gp', 'team', 'family')
  const { rates, asOf } = await fxRates()
  return { rates: Object.fromEntries(rates), as_of: asOf }
})
