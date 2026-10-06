// Set or update a fund's terms.
import { z } from 'zod'
const num = (max: number) => z.union([z.coerce.number().min(0).max(max), z.literal('').transform(() => null), z.null()]).optional()
const Body = z.object({
  entity_id: z.string().uuid().optional(), name: z.string().trim().min(1).max(200).optional(), currency: z.string().regex(/^[A-Z]{3}$/).default('USD'), target_size: num(1e13), vintage: z.union([z.coerce.number().int().min(1990).max(2100), z.literal('').transform(() => null), z.null()]).optional(),
  first_close: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('').transform(() => undefined)), final_close: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('').transform(() => undefined)),
  term_years: z.union([z.coerce.number().int().min(1).max(30), z.literal('').transform(() => null), z.null()]).optional(),
  structure: z.enum(['closed_end', 'rolling']).default('closed_end'), mgmt_fee_pct: num(100), carry_pct: num(100), hurdle_pct: num(100), status: z.enum(['raising', 'investing', 'harvesting', 'closed']).default('raising'),
  administrator: z.enum(['sydecar', 'carta', 'angellist', 'other', 'self']).default('self'), administrator_name: z.string().trim().max(200).optional(),
  admin_portal_url: z.string().trim().url().startsWith('https://').max(500).optional().or(z.literal('').transform(() => undefined)), notify_lps: z.boolean().default(true)
})
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  const b = Body.safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Check the fund terms.')
  const d = b.data
  if (!d.entity_id && !d.name) throw apiError('invalid', 'Name the fund.')
  if (!d.entity_id) d.entity_id = (await one<{ id: string }>("INSERT INTO core.entities (name, kind, status) VALUES ($1, 'fund', 'active') RETURNING id", [d.name])).id
  await assertFund(d.entity_id)
  const r = await one<{ id: string }>(
    `INSERT INTO funds.funds (entity_id, currency, target_size, vintage, first_close, final_close, term_years, mgmt_fee_pct, carry_pct, hurdle_pct, status, administrator, created_by, administrator_name, admin_portal_url, notify_lps)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     ON CONFLICT (entity_id) DO UPDATE SET currency = EXCLUDED.currency, target_size = EXCLUDED.target_size, vintage = EXCLUDED.vintage, first_close = EXCLUDED.first_close, final_close = EXCLUDED.final_close,
       term_years = EXCLUDED.term_years, mgmt_fee_pct = EXCLUDED.mgmt_fee_pct, carry_pct = EXCLUDED.carry_pct, hurdle_pct = EXCLUDED.hurdle_pct, status = EXCLUDED.status,
       administrator = EXCLUDED.administrator, administrator_name = EXCLUDED.administrator_name, admin_portal_url = EXCLUDED.admin_portal_url, notify_lps = EXCLUDED.notify_lps RETURNING id`,
    [d.entity_id, d.currency, d.target_size ?? null, d.vintage ?? null, d.first_close ?? null, d.final_close ?? null, d.term_years ?? null, d.mgmt_fee_pct ?? null, d.carry_pct ?? null, d.hurdle_pct ?? null, d.status, d.administrator, user.userId, d.administrator_name || null, d.admin_portal_url ?? null, d.notify_lps])
  await db().query('UPDATE funds.funds SET structure = $2 WHERE id = $1', [r.id, d.structure])
  await audit({ event, actorUserId: user.userId, action: 'funds.setup', objectType: 'fund', objectId: r.id, entityId: d.entity_id, detail: { status: d.status } })
  return { ok: true, id: r.id }
})
