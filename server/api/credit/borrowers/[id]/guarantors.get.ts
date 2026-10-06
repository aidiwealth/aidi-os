export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team')
  const id = String(getRouterParam(event, 'id') ?? '')
  if (!/^[0-9a-f-]{36}$/.test(id)) throw apiError('not_found', 'Not found', 404)
  const b = (await db().query<{ country: string | null }>('SELECT country FROM credit.borrowers WHERE id = $1', [id])).rows[0]
  const rows = (await db().query(`SELECT g.id, g.name, g.email, g.relationship, g.bvn_last4, g.nin_last4,
      (SELECT row_to_json(c) FROM (SELECT id, status, score, band, note, source, document_id, created_at FROM credit.checks WHERE guarantor_id = g.id ORDER BY created_at DESC LIMIT 1) c) AS last_check
    FROM credit.guarantors g WHERE g.borrower_id = $1 ORDER BY g.created_at`, [id])).rows
  const business = (await db().query("SELECT id, status, score, band, note, source, document_id, created_at FROM credit.checks WHERE borrower_id = $1 AND guarantor_id IS NULL AND document_id IS NOT NULL ORDER BY created_at DESC LIMIT 5", [id])).rows
  return { country: b?.country ?? null, nigeria: /nigeria/i.test(b?.country ?? ''), rows, business_reports: business }
}, )
