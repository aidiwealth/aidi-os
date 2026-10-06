export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team')
  const id = String(getRouterParam(event, 'id') ?? '')
  if (!/^[0-9a-f-]{36}$/.test(id)) return null
  return (await db().query(`SELECT a.id, a.status, a.amount::float, a.currency,
      (SELECT json_build_object('score', c.score, 'band', c.band) FROM credit.checks c WHERE c.borrower_id = a.borrower_id AND c.guarantor_id IS NULL AND c.score IS NOT NULL ORDER BY c.created_at DESC LIMIT 1) AS business,
      (SELECT json_agg(json_build_object('name', x.name, 'score', x.score, 'band', x.band)) FROM (SELECT DISTINCT ON (g.id) g.name, c.score, c.band FROM credit.guarantors g JOIN credit.checks c ON c.guarantor_id = g.id AND c.score IS NOT NULL WHERE g.borrower_id = a.borrower_id ORDER BY g.id, c.created_at DESC) x) AS founders
    FROM credit.applications a WHERE a.pitch_id = $1`, [id])).rows[0] ?? null
})
