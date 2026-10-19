// Move all of this company's customer revenue (customers, months, settings, linked sheet, uploads) to another company
// in the group, e.g. when the data was added before the group had its companies. Only into a company with none yet.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  const from = requireCustEntity()
  const b = z.object({ to: z.string().uuid() }).safeParse(await readBody(event))
  if (!b.success || b.data.to === from) throw apiError('invalid', 'Choose the company to move them to.')
  const ents = await custEntities()
  const target = ents.find((e) => e.id === b.data.to)
  if (!target) throw apiError('not_found', 'That company is not in this group.', 404)
  const moved = await withAllCompanies(async () => {
    if ((await db().query('SELECT 1 FROM financials.customers WHERE entity_id = $1 LIMIT 1', [b.data.to])).rowCount) throw apiError('not_empty', target.name + ' already has customer revenue. Clear it first, or add these to it by upload.', 409)
    const n = (await db().query('UPDATE financials.customers SET entity_id = $2, updated_at = now() WHERE entity_id = $1', [from, b.data.to])).rowCount ?? 0
    await db().query('UPDATE financials.customer_revenue SET entity_id = $2 WHERE entity_id = $1', [from, b.data.to])
    await db().query('DELETE FROM financials.customer_config WHERE entity_id = $1', [b.data.to])
    await db().query('UPDATE financials.customer_config SET entity_id = $2, updated_at = now() WHERE entity_id = $1', [from, b.data.to])
    await db().query('UPDATE financials.customer_imports SET entity_id = $2 WHERE entity_id = $1', [from, b.data.to])
    return n
  })
  await db().query("DELETE FROM financials.analyses WHERE subject LIKE 'customers:%' OR subject LIKE 'advice:%'").catch(() => {})
  await audit({ event, actorUserId: user.userId, action: 'financials.customers_move', objectType: 'entity', objectId: b.data.to, detail: { from, customers: moved } })
  return { ok: true, moved, to: target.name }
})
