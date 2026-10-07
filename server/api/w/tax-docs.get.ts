// Wealth client: their tax documents.
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'wealth_client')
  const id = await wmClientOfUser(user.userId)
  if (!id) return []
  return (await db().query('SELECT t.id, t.tax_year, t.form_type, t.issuer, t.note, t.created_at FROM core.tax_docs t WHERE t.wm_client_id = $1 ORDER BY t.tax_year DESC, t.created_at DESC', [id])).rows
})
