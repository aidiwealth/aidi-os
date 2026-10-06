export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team')
  return (await db().query(`SELECT a.id, a.status, a.amount::float, a.currency, a.tenor_months, a.created_at, b.name AS company, b.country,
      (SELECT c.score FROM credit.checks c WHERE c.borrower_id = b.id AND c.guarantor_id IS NULL ORDER BY c.created_at DESC LIMIT 1) AS business_score,
      (SELECT min(x.score) FROM (SELECT DISTINCT ON (c.guarantor_id) c.score FROM credit.checks c WHERE c.borrower_id = b.id AND c.guarantor_id IS NOT NULL ORDER BY c.guarantor_id, c.created_at DESC) x) AS guarantor_score,
      (SELECT string_agg(g.name, ', ') FROM credit.guarantors g WHERE g.borrower_id = b.id) AS guarantors
    FROM credit.applications a JOIN credit.borrowers b ON b.id = a.borrower_id ORDER BY a.created_at DESC LIMIT 200`)).rows
})
