// Credit or debit a workspace's wallet (goodwill credits, refunds, corrections). Always with a reason; audited.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const staff = await requirePlatform(event, true)
  const b = z.object({ organization_id: z.string().uuid(), direction: z.enum(['credit', 'debit']), amount: z.coerce.number().positive().max(100000000), reason: z.string().trim().min(3).max(300), refund: z.boolean().default(false) }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Choose the workspace, amount and a reason.')
  const d = b.data
  const r = await postLedger(d.organization_id, d.direction, Math.round(d.amount * 100), d.direction === 'credit' ? (d.refund ? 'refund' : 'admin_credit') : 'admin_debit', d.reason, { userId: staff.userId })
  await platformAudit(event, staff.userId, 'wallet_' + d.direction, d.organization_id, { amount: d.amount, reason: d.reason })
  return { ok: true, balance_minor: r?.balance ?? null }
})
