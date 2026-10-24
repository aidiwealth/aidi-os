// Accounts that come in by statement or linked sheet, with their latest balance and statements (the company at the
// top, or every company on the group view).
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin', 'gp')
  return uploadedAccounts(await forecastScope(event))
})
