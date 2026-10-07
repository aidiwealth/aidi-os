// Admins: which service models and products are on for each country, fees, savings provider.
import { z } from 'zod'
const C = z.object({ managed: z.boolean(), advisor: z.boolean(), self_directed: z.boolean(), savings: z.boolean(), alpaca: z.boolean(), busha: z.boolean(), anchor: z.boolean(), plaid: z.boolean(), savings_provider: z.enum(['alpaca', 'busha', 'manual']), savings_vendor: z.string().max(120), savings_rate: z.number().min(0).max(100), subscription: z.number().min(0), currency: z.string().regex(/^[A-Z]{3}$/) })
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin')
  const b = z.object({ US: C, NG: C, advisory_tiers: z.array(z.object({ upto: z.number().positive().nullable(), pct: z.number().min(0).max(5) })).min(1).max(6), confirm_licence: z.boolean().default(false), banks: z.record(z.enum(['US', 'NG']), z.record(z.string(), z.string().max(200))).optional() }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Check the settings.')
  const cur = await wmSettings(), d = b.data
  const licensed = (c: 'US' | 'NG') => (d[c].managed && !cur[c].managed) || (d[c].savings && !cur[c].savings) || (d[c].alpaca && !cur[c].alpaca) || (d[c].busha && !cur[c].busha) || (d[c].anchor && !cur[c].anchor)
  if ((licensed('US') || licensed('NG')) && !d.confirm_licence) throw apiError('confirm_licence', 'Turning on managed accounts, savings or trading needs the right licence. Confirm you hold it to continue.', 409)
  if (d.NG.alpaca) throw apiError('invalid', 'Alpaca is for US clients only.')
  if (d.US.busha || d.US.anchor) throw apiError('invalid', 'Busha and Anchor are for Nigerian clients only.')
  const org = (await currentOrg())!
  await asPlatform(() => db().query("UPDATE core.organizations SET settings = settings || jsonb_build_object('wm_config', $2::jsonb) WHERE id = $1", [org.id, JSON.stringify({ ...cur, US: d.US, NG: d.NG, advisory_tiers: d.advisory_tiers, ...(d.banks ? { banks: d.banks } : {}) })]))
  await audit({ event, actorUserId: user.userId, action: 'wm.settings', objectType: 'organization', objectId: org.id, detail: { US: d.US, NG: d.NG } })
  return { ok: true }
})
