import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'team')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw apiError('not_found', 'Deal not found', 404)
  const d = await db().query(
    `SELECT d.*, d.raise_usd::text, d.check_usd::text, d.valuation_usd::text, p.full_name AS owner_name
       FROM deals.deals d LEFT JOIN core.users u ON u.id = d.owner_id LEFT JOIN core.people p ON p.id = u.person_id WHERE d.id = $1`, [id.data])
  if (d.rowCount !== 1) throw apiError('not_found', 'Deal not found', 404)
  const levels = visibleLevels(user.roles)
  const events = await db().query(
    `SELECT e.id, e.kind, e.body, e.meeting_at, e.from_stage, e.to_stage, e.created_at, p.full_name AS by_name,
            CASE WHEN doc.sensitivity = ANY($2::text[]) THEN doc.id END AS document_id,
            CASE WHEN doc.sensitivity = ANY($2::text[]) THEN doc.title ELSE 'Restricted document' END AS document_title
       FROM deals.deal_events e LEFT JOIN core.users u ON u.id = e.created_by LEFT JOIN core.people p ON p.id = u.person_id
       LEFT JOIN core.documents doc ON doc.id = e.document_id
      WHERE e.deal_id = $1 ORDER BY e.created_at DESC`, [id.data, levels])
  const votes = await db().query(
    `SELECT v.vote, v.note, v.voted_at, p.full_name AS voter, v.voter_id = $2 AS mine
       FROM deals.ic_votes v JOIN core.users u ON u.id = v.voter_id JOIN core.people p ON p.id = u.person_id WHERE v.deal_id = $1 ORDER BY v.voted_at`,
    [id.data, user.userId])
  const tally = await icTally(id.data)
  return { deal: d.rows[0], events: events.rows, votes: votes.rows, tally, required: IC_APPROVALS_REQUIRED, canVote: user.roles.includes('gp') }
})
