// Set plan billing (owner only). Plans' yearly prices follow the discount, and every company's plan charge is
// re-priced to match (its next charge date is kept; prices of a company's own and free accounts are left alone).
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const staff = await requirePlatform(event, true)
  if (staff.staffRole !== 'owner') throw apiError('forbidden', 'Only the platform owner can change plan billing.', 403)
  const b = z.object({ cycles: z.enum(['monthly', 'annual', 'both']), annual_discount_pct: z.coerce.number().min(0).max(90) }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Choose how plans are billed, and a yearly discount from 0 to 90%.')
  const v = { cycles: b.data.cycles, annual_discount_pct: Math.round(b.data.annual_discount_pct * 100) / 100 }
  const was = await planBilling()
  const ids = await asPlatform(async () => {
    await db().query("INSERT INTO platform.settings (key, value, updated_by, updated_at) VALUES ('plan_billing', $1, $2, now()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()", [JSON.stringify(v), staff.userId])
    await db().query("UPDATE core.plans SET price_annual_usd = round(price_monthly_usd * 12 * (100 - $1::numeric) / 100, 2), price_annual_ngn = round(price_monthly_ngn * 12 * (100 - $1::numeric) / 100, 2) WHERE code IN ('company_startup', 'company_medium', 'company_scale')", [v.annual_discount_pct])
    return (await db().query<{ id: string }>("SELECT DISTINCT s.organization_id AS id FROM wallet.subscriptions s JOIN core.organizations o ON o.id = s.organization_id WHERE s.kind = 'plan' AND s.status = 'active' AND o.kind = 'company'")).rows.map((r) => r.id)
  })
  for (const id of ids) await repricePlan(id).catch((e) => console.error('[plan-billing] reprice', id, e))
  await platformAudit(event, staff.userId, 'plan_billing', null, { from: was, to: v, repriced: ids.length })
  return { ok: true, repriced: ids.length }
})
