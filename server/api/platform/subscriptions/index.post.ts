// Start or change a customer's subscription. A change ends the current one (history is kept) and moves the workspace
// to the new plan; a trial becomes active.
import { z } from 'zod'
const Body = z.object({
  organization_id: z.string().uuid(), plan_code: z.string().min(1), billing: z.enum(['monthly', 'annual']), method: z.enum(['invoice', 'stripe', 'paystack']).default('invoice'), currency: z.enum(['USD', 'NGN']).default('USD'),
  amount_usd: z.coerce.number().min(0).max(1e8), start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), notes: z.string().trim().max(2000).optional()
})
export default defineEventHandler(async (event) => {
  const staff = await requirePlatform(event, true)
  const b = Body.safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Choose the customer, plan, billing period, price and start date.')
  const d = b.data
  if (d.method === 'stripe' && d.currency !== 'USD') throw apiError('invalid', 'Stripe subscriptions are billed in USD. Use Paystack for NGN.')
  const id = await asPlatform(async () => {
    if (!(await db().query('SELECT 1 FROM core.plans WHERE code = $1', [d.plan_code])).rowCount) throw apiError('invalid', 'Unknown plan.')
    const org = await db().query<{ plan_code: string; status: string }>('SELECT plan_code, status FROM core.organizations WHERE id = $1', [d.organization_id])
    if (!org.rows[0]) throw apiError('not_found', 'Customer not found', 404)
    if (org.rows[0].plan_code === 'internal') throw apiError('internal', 'Aidi workspaces are not billed.')
    const client = await db().connect()
    try {
      await client.query('BEGIN')
      const cur = await client.query<{ id: string; start_date: string }>("SELECT id, to_char(start_date, 'YYYY-MM-DD') AS start_date FROM platform.subscriptions WHERE organization_id = $1 AND status <> 'ended' FOR UPDATE", [d.organization_id])
      if (cur.rows[0]) {
        if (d.start_date < cur.rows[0].start_date) throw apiError('invalid', 'The new subscription cannot start before the current one.')
        await client.query("UPDATE platform.subscriptions SET status = 'ended', ended_at = $2, end_reason = 'changed' WHERE id = $1", [cur.rows[0].id, d.start_date])
      }
      const s = await client.query<{ id: string }>('INSERT INTO platform.subscriptions (organization_id, plan_code, billing, method, amount_usd, start_date, notes, created_by, currency) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',
        [d.organization_id, d.plan_code, d.billing, d.method, d.amount_usd, d.start_date, d.notes || null, staff.userId, d.currency])
      await client.query("UPDATE core.organizations SET plan_code = $2, status = CASE WHEN status IN ('trial','past_due') THEN 'active' ELSE status END, trial_ends_at = NULL WHERE id = $1", [d.organization_id, d.plan_code])
      await client.query('COMMIT')
      return s.rows[0]!.id
    } catch (err) { await client.query('ROLLBACK'); throw err } finally { client.release() }
  })
  clearModuleCache()
  await platformAudit(event, staff.userId, 'subscription_start', d.organization_id, { plan: d.plan_code, billing: d.billing, amount: d.amount_usd, method: d.method })
  return { ok: true, id }
})
