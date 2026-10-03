// Mark a loan repaid, written off or restructured (with a note). Repaid requires nothing left outstanding.
import { z } from 'zod'
const Body = z.object({ status: z.enum(['active', 'repaid', 'written_off', 'restructured']), note: z.string().trim().min(3).max(1000) })
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  const b = Body.safeParse(await readBody(event))
  if (!id.success || !b.success) throw apiError('invalid', 'Choose a status and add a note.')
  const l = await db().query<{ principal: string }>('SELECT principal::text FROM credit.loans WHERE id = $1', [id.data])
  if (!l.rows[0]) throw apiError('not_found', 'Loan not found', 404)
  if (b.data.status === 'repaid') {
    const pos = await loadPosition(id.data, Number(l.rows[0].principal))
    if (pos.outstandingPrincipal > 0.004 || pos.arrears > 0.004) throw apiError('outstanding', 'There is still principal outstanding or arrears. Record the final repayment first, or use written off.')
  }
  await db().query('UPDATE credit.loans SET status = $2 WHERE id = $1', [id.data, b.data.status])
  await audit({ event, actorUserId: user.userId, action: 'credit.status', objectType: 'loan', objectId: id.data, detail: { status: b.data.status, note: b.data.note } })
  return { ok: true }
})
