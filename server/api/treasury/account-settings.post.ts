// An uploaded account's settings: bank or brokerage, and whether a brokerage account's holdings count in the total.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp')
  const b = z.object({ label: z.string().min(1).max(160), entity_id: z.string().uuid().nullable(), kind: z.enum(['bank', 'brokerage']).optional(), include_holdings: z.boolean().optional() }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Invalid request.')
  const sc = await forecastScope(event), e = b.data.entity_id ?? await companyEntityId()
  if (!e || !(sc.group ? sc.companies.some((c) => c.id === e) : sc.entity === e)) throw apiError('not_found', 'Not found', 404)
  await db().query(`INSERT INTO banking.account_settings (entity_id, account_label, kind, include_holdings) VALUES ($1, $2, coalesce($3, 'bank'), coalesce($4, true))
    ON CONFLICT (organization_id, entity_id, account_label) DO UPDATE SET kind = coalesce($3, banking.account_settings.kind), include_holdings = coalesce($4, banking.account_settings.include_holdings), updated_at = now()`,
  [e, b.data.label, b.data.kind ?? null, b.data.include_holdings ?? null])
  const n = b.data.kind === 'brokerage' ? await fixBrokerage() : 0
  await audit({ event, actorUserId: user.userId, action: 'treasury.account_settings', objectType: 'bank_account', detail: { kind: b.data.kind, include_holdings: b.data.include_holdings, recategorised: n } })
  return { ok: true }
})
