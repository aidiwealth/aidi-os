// Add, edit or remove a holding for a wealth client or for the group (stocks, ETFs, crypto, gold/silver, savings…).
// Holdings live in the same table as Investments & AUM, so client assets count in AUM and group metals in the NAV.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp', 'team')
  const b = z.object({ id: z.string().uuid().optional(), delete: z.boolean().optional(), wm_client_id: z.string().uuid().nullable().optional(),
    category: z.enum(['public_securities', 'crypto', 'precious_metals', 'bonds', 'cash', 'fund', 'real_estate', 'retirement', 'other']).optional(), name: z.string().trim().min(1).max(200).optional(), platform: z.string().trim().max(120).optional(),
    currency: z.string().regex(/^[A-Z]{3}$/).optional(), cost: z.number().min(0).nullable().optional(), current_value: z.number().min(0).nullable().optional(), as_of: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), notes: z.string().max(3000).optional(),
    meta: z.object({ symbol: z.string().max(20).optional(), units: z.number().min(0).optional(), metal: z.enum(['gold', 'silver', 'platinum']).optional(), product: z.string().max(200).optional(), quantity: z.number().min(0).optional(), ounces: z.number().min(0).optional(), dealer: z.string().max(120).optional(), vault: z.string().max(120).optional(), certificate: z.string().max(120).optional(), valuation: z.enum(['manual', 'spot']).optional(), rate: z.number().min(0).max(100).optional(), maturity: z.string().max(20).optional() }).optional() }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Check the holding details.')
  const d = b.data
  if (d.id && d.delete) { await db().query("UPDATE wealth.holdings SET status = 'sold', updated_at = now() WHERE id = $1", [d.id]); return { ok: true } }
  const client = d.wm_client_id ? (await db().query<{ name: string; entity_id: string | null }>('SELECT name, entity_id FROM wm.clients WHERE id = $1', [d.wm_client_id])).rows[0] : undefined
  if (d.wm_client_id && !client) throw apiError('not_found', 'Client not found.', 404)
  let value = d.current_value ?? null
  if (d.category === 'precious_metals' && d.meta?.valuation === 'spot' && d.meta.ounces) { const cfg = await wmSettings(); const spot = d.meta.metal === 'silver' ? cfg.silver_usd_oz : cfg.gold_usd_oz; if (spot) value = Math.round(spot * d.meta.ounces * 100) / 100 }
  if (d.id) await db().query('UPDATE wealth.holdings SET category = coalesce($2, category), name = coalesce($3, name), platform = $4, currency = coalesce($5, currency), cost = $6, current_value = $7, as_of = coalesce($8::date, as_of), notes = $9, meta = meta || $10::jsonb, updated_at = now() WHERE id = $1',
    [d.id, d.category ?? null, d.name ?? null, d.platform || null, d.currency ?? null, d.cost ?? null, value, d.as_of ?? null, d.notes || null, JSON.stringify(d.meta ?? {})])
  else {
    if (!d.category || !d.name || !d.currency) throw apiError('invalid', 'Add the asset type, name and currency.')
    const ins = await one<{ id: string }>("INSERT INTO wealth.holdings (entity_id, client_name, section, category, name, platform, currency, cost, current_value, status, as_of, notes, meta, in_nav, in_aum, wm_client_id, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'active',$10,$11,$12,$13,$14,$15,$16) RETURNING id",
      [client?.entity_id ?? null, client?.name ?? null, client ? 'client' : 'family', d.category, d.name, d.platform || null, d.currency, d.cost ?? null, value, d.as_of ?? new Date().toISOString().slice(0, 10), d.notes || null, JSON.stringify(d.meta ?? {}), !client, !!client, d.wm_client_id ?? null, user.userId])
    if (client && d.wm_client_id && d.cost) { try { const t = await templateMd('investment_confirmation', d.wm_client_id, ins.id); await issueClientDoc(d.wm_client_id, 'investment_confirmation', t.title, t.md, false, user.userId, ins.id) } catch (err) { console.error('[wm] confirmation', err) } }
  }
  await audit({ event, actorUserId: user.userId, action: 'wm.holding', objectType: 'holding', objectId: d.id })
  return { ok: true }
})
