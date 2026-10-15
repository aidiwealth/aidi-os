// Team pay for a period, each with whether the bank shows it, and bank lines that look like unlogged pay (admins).
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin')
  const q = getQuery(event)
  return teamPayHistory(String(q.from ?? ''), String(q.to ?? ''))
})
