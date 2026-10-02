export interface PipelineCard {
  id: string; company: string; one_liner: string | null; stage: string; round: string | null; raise_usd: string | null
  check_usd: string | null; owner: string | null; stage_since: string; pitch_id: string | null; last_activity: string | null
}
export default defineEventHandler(async (event): Promise<PipelineCard[]> => {
  await requireRole(event, 'gp', 'team')
  const r = await db().query<PipelineCard>(
    `SELECT d.id, d.company, d.one_liner, d.stage, d.round, d.raise_usd::text, d.check_usd::text, p.full_name AS owner,
            d.stage_since, d.pitch_id, (SELECT max(created_at) FROM deals.deal_events e WHERE e.deal_id = d.id) AS last_activity
       FROM deals.deals d LEFT JOIN core.users u ON u.id = d.owner_id LEFT JOIN core.people p ON p.id = u.person_id
      ORDER BY d.stage_since DESC LIMIT 1000`)
  return r.rows
})
