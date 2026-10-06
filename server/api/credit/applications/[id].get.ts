export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team')
  const id = String(getRouterParam(event, 'id') ?? '')
  if (!/^[0-9a-f-]{36}$/.test(id)) throw apiError('not_found', 'Not found', 404)
  const a = (await db().query("SELECT a.*, a.amount::float AS amount, a.monthly_revenue::float AS monthly_revenue, b.name AS company, b.country, b.sector, b.contact_name, b.contact_email, p.one_liner, p.description, p.website, p.deck_url FROM credit.applications a JOIN credit.borrowers b ON b.id = a.borrower_id LEFT JOIN deals.pitches p ON p.id = a.pitch_id WHERE a.id = $1", [id])).rows[0]
  if (!a) throw apiError('not_found', 'Not found', 404)
  const business = (await db().query("SELECT id, status, score, band, note, created_at FROM credit.checks WHERE borrower_id = $1 AND guarantor_id IS NULL ORDER BY created_at DESC LIMIT 5", [a.borrower_id])).rows
  const guarantors = (await db().query(`SELECT g.id, g.name, g.email, g.phone, g.relationship, g.bvn_last4, g.nin_last4, to_char(g.dob, 'YYYY-MM-DD') AS dob,
      (SELECT row_to_json(c) FROM (SELECT status, score, band, note, created_at FROM credit.checks WHERE guarantor_id = g.id ORDER BY created_at DESC LIMIT 1) c) AS last_check
    FROM credit.guarantors g WHERE g.borrower_id = $1 ORDER BY g.created_at`, [a.borrower_id])).rows
  const entities = (await db().query("SELECT id, name FROM core.entities WHERE status <> 'dissolved' ORDER BY name")).rows
  return { app: a, business, guarantors, entities }
})
