// Invested deals that are not yet portfolio companies (with the pitch's founder, when there is one).
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team')
  const r = await db().query<{ id: string; company: string; founder_name: string | null; email: string | null }>(
    `SELECT d.id, d.company, p.founder_name, p.email FROM deals.deals d LEFT JOIN deals.pitches p ON p.id = d.pitch_id
      WHERE d.stage = 'invested' AND NOT EXISTS (SELECT 1 FROM portfolio.companies c WHERE c.deal_id = d.id) ORDER BY d.company`)
  return r.rows
})
