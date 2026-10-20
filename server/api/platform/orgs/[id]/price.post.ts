// What one company pays for its plan: the plan's list price (billed yearly), a price of its own (yearly or monthly, in
// its wallet currency), or free. The plan subscription is updated at once; logged in the company's audit trail.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const staff = await requirePlatform(event, true)
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  const b = z.object({ kind: z.enum(['list', 'custom', 'free']), amount: z.coerce.number().min(0.01).max(1e9).optional(), interval: z.enum(['month', 'year']).default('year'), note: z.string().trim().max(200).default('') }).safeParse(await readBody(event))
  if (!id.success || !b.success) throw apiError('invalid', 'Choose list price, a price of its own (an amount above zero) or free.')
  const d = b.data
  if (d.kind === 'custom' && !d.amount) throw apiError('invalid', 'Enter the amount.')
  const ov = d.kind === 'list' ? null : { ...(d.kind === 'free' ? { free: true } : { amount: Math.round(d.amount! * 100) / 100, interval: d.interval }), note: d.note, set_at: new Date().toISOString().slice(0, 10), set_by: staff.email }
  await asPlatform(async () => {
    const o = (await db().query<{ kind: string }>('SELECT kind FROM core.organizations WHERE id = $1', [id.data])).rows[0]
    if (!o) throw apiError('not_found', 'Not found', 404)
    if (o.kind !== 'company') throw apiError('invalid', 'Prices are for Finvry companies.')
    await db().query(ov ? "UPDATE core.organizations SET settings = settings || jsonb_build_object('price_override', $2::jsonb) WHERE id = $1" : "UPDATE core.organizations SET settings = settings - 'price_override' WHERE id = $1", ov ? [id.data, JSON.stringify(ov)] : [id.data])
  })
  await syncPlanSubscription(id.data)
  await platformAudit(event, staff.userId, 'workspace_price', id.data, { kind: d.kind, amount: d.amount ?? null, interval: d.interval, note: d.note })
  return { ok: true }
})
