export interface DealRow {
  id: string; received_at: string; company: string; founder_name: string; stage: string; country: string | null
  one_liner: string; status: string; score: number | null; recommendation: string | null
}
export default defineEventHandler(async (event): Promise<DealRow[]> => {
  await requireRole(event, 'gp', 'team')
  const r = await db().query<DealRow>(
    `SELECT p.id, p.received_at, p.company, p.founder_name, p.stage, p.country, p.one_liner, p.status, s.score, s.recommendation
       FROM deals.pitches p
       LEFT JOIN LATERAL (SELECT score, recommendation FROM deals.screenings WHERE pitch_id = p.id ORDER BY created_at DESC LIMIT 1) s ON true
      WHERE p.status <> 'spam'
      ORDER BY p.received_at DESC LIMIT 500`)
  return r.rows
})
