// A borrower's credit checks, newest first (score history and the latest report).
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team')
  const id = String(getRouterParam(event, 'id') ?? '')
  if (!/^[0-9a-f-]{36}$/.test(id)) throw apiError('not_found', 'Not found', 404)
  const b = (await db().query('SELECT id, name, country, kind, monitor, identifier_last4 FROM credit.borrowers WHERE id = $1', [id])).rows[0]
  if (!b) throw apiError('not_found', 'Not found', 404)
  const checks = (await db().query('SELECT id, provider, kind, status, score, band, summary, note, created_at FROM credit.checks WHERE borrower_id = $1 AND guarantor_id IS NULL ORDER BY created_at DESC LIMIT 36', [id])).rows
  return { borrower: b, checks, nigeria: /^\s*nigeria\s*$/i.test(String(b.country ?? '')), us_bureau: usBureauOn() }
})
