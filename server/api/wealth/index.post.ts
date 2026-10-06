// Add or edit a holding. A changed value is kept in the valuation history.
import { z } from 'zod'
const N = z.union([z.coerce.number().finite(), z.literal('').transform(() => null), z.null()]).optional()
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  const b = z.object({ id: z.string().uuid().optional(), entity_id: z.string().uuid().nullable().optional(), client_name: z.string().trim().max(200).nullable().optional(), section: z.enum(['family', 'wealth', 'venture', 'real_estate', 'client']),
    category: z.enum(['venture', 'private_stake', 'public_securities', 'fund', 'bonds', 'retirement', 'cash', 'crypto', 'precious_metals', 'real_estate', 'other', 'liability']), name: z.string().trim().min(1).max(200), platform: z.string().trim().max(120).nullable().optional(),
    currency: z.string().regex(/^[A-Z]{3}$/).default('USD'), cost: N, current_value: N, realized: N, ownership_pct: N, status: z.enum(['active', 'realized', 'at_cost', 'nil', 'written_off', 'sold']).default('active'),
    last_valuation: N, as_of: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(), notes: z.string().max(3000).nullable().optional(), in_nav: z.boolean().default(true), in_aum: z.boolean().default(true) }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Check the holding details.')
  const d = b.data
  const args = [d.entity_id ?? null, d.client_name || null, d.section, d.category, d.name, d.platform || null, d.currency, d.cost ?? null, d.current_value ?? null, d.realized ?? null, d.ownership_pct ?? null, d.status, d.as_of ?? null, d.notes || null, d.in_nav, d.in_aum]
  let id = d.id
  if (id) {
    const prev = (await db().query<{ v: string | null }>('SELECT current_value::text AS v FROM wealth.holdings WHERE id = $1', [id])).rows[0]
    if (!prev) throw apiError('not_found', 'Not found', 404)
    await db().query('UPDATE wealth.holdings SET entity_id = $2, client_name = $3, section = $4, category = $5, name = $6, platform = $7, currency = $8, cost = $9, current_value = $10, realized = $11, ownership_pct = $12, status = $13, as_of = $14, notes = $15, in_nav = $16, in_aum = $17, updated_at = now() WHERE id = $1', [id, ...args])
    if (d.current_value != null && Number(prev.v ?? NaN) !== d.current_value) await db().query('INSERT INTO wealth.valuations (holding_id, as_of, value, created_by) VALUES ($1, coalesce($2::date, current_date), $3, $4)', [id, d.as_of ?? null, d.current_value, user.userId])
  } else {
    id = (await one<{ id: string }>('INSERT INTO wealth.holdings (entity_id, client_name, section, category, name, platform, currency, cost, current_value, realized, ownership_pct, status, as_of, notes, in_nav, in_aum, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id', [...args, user.userId])).id
    if (d.current_value != null) await db().query('INSERT INTO wealth.valuations (holding_id, as_of, value, created_by) VALUES ($1, coalesce($2::date, current_date), $3, $4)', [id, d.as_of ?? null, d.current_value, user.userId])
  }
  if (d.last_valuation != null) await db().query("UPDATE wealth.holdings SET meta = meta || jsonb_build_object('last_valuation', $2::numeric, 'valuation_date', coalesce($3, current_date::text)) WHERE id = $1", [id, d.last_valuation, d.as_of ?? null])
  await audit({ event, actorUserId: user.userId, action: d.id ? 'wealth.update' : 'wealth.create', objectType: 'holding', objectId: id })
  return { ok: true, id }
})
