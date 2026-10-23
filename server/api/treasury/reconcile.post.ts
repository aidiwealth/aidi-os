// Mark a month reconciled (bank against Financials), with a note, or undo it.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp')
  const b = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/), reconciled: z.boolean(), note: z.string().trim().max(1000).optional(), gap: z.number().nullable().optional() }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Choose the month.')
  const sc = await forecastScope(event), scope = sc.group ? 'group' : sc.entity ?? 'group'
  if (!b.data.reconciled) await db().query('DELETE FROM banking.reconciled WHERE scope = $1 AND month = $2', [scope, b.data.month])
  else await db().query(`INSERT INTO banking.reconciled (scope, month, note, gap, by_user) VALUES ($1,$2,$3,$4,$5)
    ON CONFLICT (organization_id, scope, month) DO UPDATE SET note = EXCLUDED.note, gap = EXCLUDED.gap, by_user = EXCLUDED.by_user, at = now()`, [scope, b.data.month, b.data.note || null, b.data.gap ?? null, user.userId])
  await audit({ event, actorUserId: user.userId, action: 'treasury.reconcile', objectType: 'bank_month', detail: { scope, month: b.data.month, reconciled: b.data.reconciled } })
  return { ok: true }
})
