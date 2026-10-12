// Withdraw an agreement that has not been signed yet.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireOperator(event)
  const id = z.string().uuid().safeParse(getRouterParam(event, 'sid'))
  if (!id.success) throw apiError('not_found', 'Not found', 404)
  const r = await asPlatform(() => db().query("UPDATE legal.signatures SET status = 'void' WHERE id = $1 AND status = 'pending' RETURNING job_id", [id.data]))
  if (!r.rowCount) throw apiError('state', 'Only an unsigned agreement can be withdrawn.', 409)
  await audit({ event, actorUserId: user.userId, action: 'services.agreement_withdrawn', objectType: 'agreement', objectId: id.data })
  return { ok: true }
})
