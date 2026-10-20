// "Not the same customer": the founder says a suggested duplicate is really different customers. Remembered for this
// company, so neither uploads nor the linked sheet suggest it again, and taken off the list now.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  requireCustEntity()
  const b = z.object({ names: z.array(z.string().trim().min(1).max(300)).min(2).max(50) }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Choose the names.')
  const names = [...new Set(b.data.names)]
  await db().query(`INSERT INTO financials.customer_config (not_same) VALUES (jsonb_build_array($1::jsonb))
    ON CONFLICT (organization_id, (coalesce(entity_id, '00000000-0000-0000-0000-000000000000'::uuid))) DO UPDATE SET not_same = coalesce(financials.customer_config.not_same, '[]'::jsonb) || jsonb_build_array($1::jsonb)`, [JSON.stringify(names)])
  // Take it off the list shown under the linked sheet.
  const key = (n: string) => n.trim().toLowerCase(), set = new Set(names.map(key))
  const cur = (await db().query<{ link_result: { possible?: { names: string[] }[] } | null }>('SELECT link_result FROM financials.customer_config LIMIT 1')).rows[0]?.link_result
  if (cur?.possible) await db().query('UPDATE financials.customer_config SET link_result = $1::jsonb', [JSON.stringify({ ...cur, possible: cur.possible.filter((g) => !g.names.every((n) => set.has(key(n)))) })])
  await audit({ event, actorUserId: user.userId, action: 'financials.customers_not_same', objectType: 'customer_config', detail: { names } })
  return { ok: true }
})
