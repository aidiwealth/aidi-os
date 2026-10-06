// Latest credit score band for every borrower (business) and guarantor (founder), for the chart.
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team')
  const rows = (await db().query<{ who: string; kind: string; name: string; score: number | null; band: string | null; status: string | null; country: string | null }>(`
    SELECT 'business' AS who, b.kind, b.name, c.score, c.band, c.status, b.country FROM credit.borrowers b LEFT JOIN LATERAL (SELECT score, band, status FROM credit.checks WHERE borrower_id = b.id AND guarantor_id IS NULL ORDER BY created_at DESC LIMIT 1) c ON true
    UNION ALL
    SELECT 'guarantor', 'individual', g.name || ' (' || b.name || ')', c.score, c.band, c.status, b.country FROM credit.guarantors g JOIN credit.borrowers b ON b.id = g.borrower_id LEFT JOIN LATERAL (SELECT score, band, status FROM credit.checks WHERE guarantor_id = g.id ORDER BY created_at DESC LIMIT 1) c ON true`)).rows
  return { rows }
})
