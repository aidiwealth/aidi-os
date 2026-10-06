export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team')
  const id = String(getRouterParam(event, 'id') ?? '')
  if (!/^[0-9a-f-]{36}$/.test(id)) throw apiError('not_found', 'Not found', 404)
  return (await db().query(`SELECT g.id, g.name, g.email, g.relationship, g.bvn_last4, g.nin_last4,
      (SELECT row_to_json(c) FROM (SELECT status, score, band, note, created_at FROM credit.checks WHERE guarantor_id = g.id ORDER BY created_at DESC LIMIT 1) c) AS last_check
    FROM credit.guarantors g WHERE g.borrower_id = $1 ORDER BY g.created_at`, [id])).rows
})
