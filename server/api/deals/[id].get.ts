import { z } from 'zod'
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw apiError('not_found', 'Pitch not found', 404)
  const p = await db().query('SELECT * FROM deals.pitches WHERE id = $1', [id.data])
  if (p.rowCount !== 1) throw apiError('not_found', 'Pitch not found', 404)
  const screenings = await db().query(
    `SELECT s.id, s.created_at, s.score, s.recommendation, s.thesis_fit, s.team_score, s.market_score, s.traction_score, s.detail,
            r.model, r.prompt_version, r.cost_usd
       FROM deals.screenings s JOIN core.ai_runs r ON r.id = s.ai_run_id WHERE s.pitch_id = $1 ORDER BY s.created_at DESC`, [id.data])
  const decisions = await db().query(
    `SELECT d.id, d.decision, d.note, d.decided_at, u.email AS decided_by
       FROM deals.decisions d JOIN core.users u ON u.id = d.decided_by WHERE d.pitch_id = $1 ORDER BY d.decided_at DESC`, [id.data])
  const failed = await db().query<{ n: number }>(
    "SELECT count(*)::int AS n FROM core.ai_runs WHERE input_ref = $1 AND NOT valid", ['deals.pitches:' + id.data])
  const deal = await db().query<{ id: string }>('SELECT id FROM deals.deals WHERE pitch_id = $1', [id.data])
  return { pitch: p.rows[0], screenings: screenings.rows, decisions: decisions.rows, failedRuns: failed.rows[0]?.n ?? 0, dealId: deal.rows[0]?.id ?? null }
})
