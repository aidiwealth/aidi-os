// Merge customers that are the same (keeps the first one's name unless another is given).
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  requireCustEntity()
  // Either customer ids and the one to keep, or (a suggested duplicate) the names and the name to keep.
  const body = await readBody(event)
  const byName = z.object({ names: z.array(z.string().trim().min(1).max(300)).min(2).max(50), to: z.string().trim().min(1).max(300) }).safeParse(body)
  if (byName.success) {
    const found = (await db().query<{ id: string; name: string }>('SELECT id, name FROM financials.customers WHERE lower(name) = ANY($1::text[])', [byName.data.names.map((n) => n.toLowerCase())])).rows
    const keepRow = found.find((x) => x.name.toLowerCase() === byName.data.to.toLowerCase()) ?? found[0]
    if (found.length < 2 || !keepRow) throw apiError('invalid', 'These customers are already merged or no longer there. Read the sheet again to refresh the list.')
    ;(body as Record<string, unknown>).ids = found.map((x) => x.id); (body as Record<string, unknown>).keep = keepRow.id
  }
  const b = z.object({ ids: z.array(z.string().uuid()).min(2).max(50), keep: z.string().uuid() }).safeParse(body)
  if (!b.success || !b.data.ids.includes(b.data.keep)) throw apiError('invalid', 'Choose the customers to merge and which name to keep.')
  const olds = b.data.ids.filter((x) => x !== b.data.keep)
  // Remember the names, so a linked sheet keeps them merged on every read.
  const names = (await db().query<{ id: string; name: string }>('SELECT id, name FROM financials.customers WHERE id = ANY($1::uuid[])', [b.data.ids])).rows
  const keepName = names.find((x) => x.id === b.data.keep)?.name
  if (keepName) await rememberMerges([{ names: names.map((x) => x.name), to: keepName }])
  await db().query(`INSERT INTO financials.customer_revenue (customer_id, month, amount) SELECT $1, month, sum(amount) FROM financials.customer_revenue WHERE customer_id = ANY($2::uuid[]) GROUP BY month
    ON CONFLICT (customer_id, month) DO UPDATE SET amount = financials.customer_revenue.amount + EXCLUDED.amount`, [b.data.keep, olds])
  await db().query('DELETE FROM financials.customers WHERE id = ANY($1::uuid[])', [olds])
  // Take the merged names off the "possible duplicates" list under the linked sheet (no need to read the sheet again).
  const key = (n: string) => n.trim().toLowerCase(), set = new Set(names.map((x) => key(x.name)))
  const cur = (await db().query<{ link_result: { possible?: { names: string[] }[] } | null }>('SELECT link_result FROM financials.customer_config LIMIT 1')).rows[0]?.link_result
  if (cur?.possible) await db().query('UPDATE financials.customer_config SET link_result = $1::jsonb', [JSON.stringify({ ...cur, possible: cur.possible.filter((g) => !g.names.every((n) => set.has(key(n)))) })])
  await audit({ event, actorUserId: user.userId, action: 'customers.merge', objectType: 'customer', objectId: b.data.keep, detail: { merged: olds.length } })
  return { ok: true }
})
