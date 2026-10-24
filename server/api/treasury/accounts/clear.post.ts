// Clear an uploaded account: all its transactions, balances and statements (to start it again from fresh statements).
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp')
  const b = z.object({ label: z.string().min(1).max(160), entity_id: z.string().uuid().nullable() }).parse(await readBody(event))
  const sc = await forecastScope(event), r = await clearAccount(b.entity_id, b.label, sc.group ? sc.companies.map((c) => c.id) : [sc.entity ?? ''])
  if (!r) throw apiError('not_found', 'Not found', 404)
  await audit({ event, actorUserId: user.userId, action: 'treasury.account_clear', objectType: 'bank_account', detail: { removed: r.removed } })
  return { ok: true, removed: r.removed }
})
