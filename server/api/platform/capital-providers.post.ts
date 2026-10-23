// Add, change, verify or remove a capital provider; or save the Stage Monitor rules (thresholds and weights).
import { z } from 'zod'
const list = z.array(z.string().trim().min(1).max(80)).max(60).default([])
const amt = z.preprocess((v) => (v === '' || v === null || v === undefined ? null : Number(String(v).replace(/[,\s$₦]/g, ''))), z.number().min(0).max(1e12).nullable())
const Band = z.object({ label: z.string().trim().min(1).max(60), arr: z.object({ seed: z.number().min(0), series_a: z.number().min(0), series_b: z.number().min(0) }), raised: z.object({ pre_seed: z.number().min(0), seed: z.number().min(0), series_a: z.number().min(0) }) })
const W = (keys: string[]) => z.object(Object.fromEntries(keys.map((k) => [k, z.number().min(0).max(100)])))
export default defineEventHandler(async (event) => {
  const staff = await requirePlatform(event, true)
  const body = await readBody(event)
  if (body?.rules) {
    const r = z.object({ regions: z.object({ us: Band, ng: Band, other: Band }), equity: W(['growth', 'revenue', 'margin', 'retention', 'cap_table', 'data_room']), debt: W(['history', 'consistency', 'margin', 'cover', 'debt', 'bank']) }).safeParse(body.rules)
    if (!r.success) throw apiError('invalid', 'Check the thresholds and weights (numbers only).')
    await asPlatform(() => db().query("INSERT INTO platform.settings (key, value, updated_by, updated_at) VALUES ('stage_rules', $1, $2, now()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()", [JSON.stringify(r.data), staff.userId]))
    await platformAudit(event, staff.userId, 'stage_rules', null, r.data)
    return { ok: true }
  }
  const b = z.object({ id: z.string().uuid().optional(), delete: z.boolean().optional(), name: z.string().trim().min(2).max(200).optional(),
    kind: z.enum(['vc', 'angel_network', 'accelerator', 'grant', 'bank', 'venture_debt', 'revenue_based', 'dfi', 'government', 'other']).default('vc'), instrument: z.enum(['equity', 'debt', 'grant']).default('equity'),
    countries: list, stages: z.array(z.enum(['pre_seed', 'seed', 'series_a', 'series_b', 'growth'])).default([]), sectors: list, ticket_min: amt.optional(), ticket_max: amt.optional(),
    currency: z.string().regex(/^[A-Z]{3}$/).default('USD'), criteria: z.string().trim().max(2000).optional(), link: z.string().trim().max(400).regex(/^(https?:\/\/.+)?$/).optional(), source: z.string().trim().max(200).optional(), verified: z.boolean().default(false), affiliate: z.boolean().default(false), active: z.boolean().default(true) }).safeParse(body)
  if (!b.success) throw apiError('invalid', 'Check the provider: a name, and a link starting with https:// if you add one.')
  const d = b.data
  if (d.delete && d.id) { await asPlatform(() => db().query('DELETE FROM platform.capital_providers WHERE id = $1', [d.id])); await platformAudit(event, staff.userId, 'capital_provider.delete', null, { id: d.id }); return { ok: true } }
  if (!d.name) throw apiError('invalid', 'Name the provider.')
  const args = [d.name, d.kind, d.instrument, d.countries, d.stages, d.sectors, d.ticket_min ?? null, d.ticket_max ?? null, d.currency, d.criteria || null, d.link || null, d.source || null, d.verified, d.affiliate, d.active]
  const id = await asPlatform(async () => d.id
    ? (await db().query<{ id: string }>(`UPDATE platform.capital_providers SET name = $2, kind = $3, instrument = $4, countries = $5, stages = $6, sectors = $7, ticket_min = $8, ticket_max = $9, currency = $10, criteria = $11, link = $12, source = $13,
        verified_on = CASE WHEN $14 THEN coalesce(verified_on, current_date) ELSE NULL END, affiliate = $15, active = $16, updated_at = now() WHERE id = $1 RETURNING id`, [d.id, ...args])).rows[0]?.id
    : (await db().query<{ id: string }>(`INSERT INTO platform.capital_providers (name, kind, instrument, countries, stages, sectors, ticket_min, ticket_max, currency, criteria, link, source, verified_on, affiliate, active)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, CASE WHEN $13 THEN current_date END, $14, $15) RETURNING id`, args)).rows[0]?.id).catch((e: { code?: string }) => { if (e.code === '23505') throw apiError('duplicate', 'A provider with that name is already listed.', 409); throw e })
  if (!id) throw apiError('not_found', 'Not found', 404)
  await platformAudit(event, staff.userId, d.id ? 'capital_provider.update' : 'capital_provider.create', null, { id, name: d.name, verified: d.verified })
  return { ok: true, id }
})
