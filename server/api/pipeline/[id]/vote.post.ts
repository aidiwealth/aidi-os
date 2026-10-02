// IC vote by a GP (one vote each; voting again replaces it). Only while the deal is at IC.
import { z } from 'zod'
const Body = z.object({ vote: z.enum(['approve', 'reject']), note: z.string().trim().max(2000).optional() })
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  if (!user.roles.includes('gp')) throw apiError('forbidden', 'Only GPs vote at IC.', 403)
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  const b = Body.safeParse(await readBody(event))
  if (!id.success || !b.success) throw apiError('invalid', 'Choose approve or reject.')
  const d = await db().query<{ stage: string }>('SELECT stage FROM deals.deals WHERE id = $1', [id.data])
  if (!d.rows[0]) throw apiError('not_found', 'Deal not found', 404)
  if (d.rows[0].stage !== 'ic') throw apiError('not_ic', 'Votes can only be cast while the deal is at IC.')
  await db().query(
    `INSERT INTO deals.ic_votes (deal_id, voter_id, vote, note) VALUES ($1,$2,$3,$4)
     ON CONFLICT (deal_id, voter_id) DO UPDATE SET vote = EXCLUDED.vote, note = EXCLUDED.note, voted_at = now()`,
    [id.data, user.userId, b.data.vote, b.data.note || null])
  await db().query('INSERT INTO deals.deal_events (deal_id, kind, body, created_by) VALUES ($1,$2,$3,$4)',
    [id.data, 'ic_vote', (b.data.vote === 'approve' ? 'Approved' : 'Rejected') + (b.data.note ? ': ' + b.data.note : ''), user.userId])
  await audit({ event, actorUserId: user.userId, action: 'pipeline.ic_vote', objectType: 'deal', objectId: id.data, detail: { vote: b.data.vote } })
  return { ok: true }
})
