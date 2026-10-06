// Admins: loan and credit-scoring settings, and the CreditChek key (stored encrypted on the workspace).
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin')
  const b = z.object({ config: z.object({ loans_enabled: z.boolean(), countries: z.array(z.string().max(80)).max(60), auto_checks: z.boolean(), require_bvn: z.boolean(), max_amount: z.record(z.string().regex(/^[A-Z]{3}$/), z.number().min(0)),
      bands: z.object({ excellent: z.number().int().min(300).max(850), good: z.number().int().min(300).max(850), fair: z.number().int().min(300).max(850) }), default_rate: z.number().min(0).max(200), default_tenor: z.number().int().min(1).max(360) }).optional(),
    creditchek_key: z.string().trim().max(500).optional(), clear_key: z.boolean().optional() }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Check the settings.')
  const d = b.data, org = (await currentOrg())!
  if (d.config) { if (!(d.config.bands.excellent > d.config.bands.good && d.config.bands.good > d.config.bands.fair)) throw apiError('invalid', 'Score bands must go down: Excellent > Good > Fair.'); await asPlatform(() => db().query("UPDATE core.organizations SET settings = settings || jsonb_build_object('credit_config', $2::jsonb) WHERE id = $1", [org.id, JSON.stringify(d.config)])) }
  if (d.creditchek_key) await asPlatform(() => db().query("UPDATE core.organizations SET settings = settings || jsonb_build_object('creditchek_key_enc', $2::text) WHERE id = $1", [org.id, encryptText(d.creditchek_key!)]))
  if (d.clear_key) await asPlatform(() => db().query("UPDATE core.organizations SET settings = settings - 'creditchek_key_enc' WHERE id = $1", [org.id]))
  await audit({ event, actorUserId: user.userId, action: 'credit.settings', objectType: 'organization', objectId: org.id, detail: { key_changed: !!d.creditchek_key || !!d.clear_key } })
  return { ok: true }
})
