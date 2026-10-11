// The team places an order for a client with the same steps the client sees in Finvry. Prices can be overridden
// (agreed price, old order) and the payment recorded: email the invoice, keep it as a draft, mark it already paid
// (e.g. bank transfer, with the date), or log the work with no invoice at all.
import { z } from 'zod'
const Admin = z.object({
  prices: z.record(z.string().regex(/^[a-z][a-z0-9_]{1,40}$/), z.coerce.number().min(0).max(1e10)).default({}),
  payment: z.enum(['invoice', 'draft', 'paid', 'none']).default('invoice'),
  paid_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('').transform(() => undefined)),
  paid_note: z.string().trim().max(300).optional(),
  extra: z.array(z.object({ description: z.string().trim().min(1).max(300), quantity: z.coerce.number().positive().max(1e6).default(1), unit_amount: z.coerce.number().min(0).max(1e10) })).max(30).default([])
})
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'team', 'gp')
  const cid = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  const raw = await readBody(event)
  const b = OrderBody.safeParse(raw), a = Admin.safeParse(raw)
  if (!cid.success || !b.success || !a.success) throw apiError('invalid', 'Choose at least one service and check the prices.')
  if (!(await db().query('SELECT 1 FROM services.clients WHERE id = $1', [cid.data])).rowCount) throw apiError('not_found', 'Client not found', 404)
  const me = (await db().query<{ name: string }>('SELECT p.full_name AS name FROM core.users u JOIN core.people p ON p.id = u.person_id WHERE u.id = $1', [user.userId])).rows[0]?.name ?? user.email
  const r = await placeServiceOrder(cid.data, { name: me, email: user.email }, b.data, { admin: true, prices: a.data.prices, payment: a.data.payment, paid_on: a.data.paid_on, paid_note: a.data.paid_note, extra: a.data.extra })
  await db().query('UPDATE services.jobs SET created_by = $2, owner_id = coalesce(owner_id, $2) WHERE id = $1', [r.job_id, user.userId]).catch(() => {})
  await audit({ event, actorUserId: user.userId, action: 'services.order_for_client', objectType: 'job', objectId: r.job_id, detail: { codes: b.data.codes, payment: a.data.payment, overrides: a.data.prices, custom_rows: a.data.extra.length } })
  return { ok: true, ...r }
})
