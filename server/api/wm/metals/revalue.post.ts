// Set today's gold and silver spot prices (USD/oz) and revalue every metal holding marked "spot".
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp')
  const b = z.object({ gold: z.number().positive().nullable(), silver: z.number().positive().nullable() }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Enter the spot prices.')
  const org = (await currentOrg())!, cfg = await wmSettings()
  const next = { ...cfg, gold_usd_oz: b.data.gold, silver_usd_oz: b.data.silver, spot_as_of: new Date().toISOString().slice(0, 10) }
  await asPlatform(() => db().query("UPDATE core.organizations SET settings = settings || jsonb_build_object('wm_config', $2::jsonb) WHERE id = $1", [org.id, JSON.stringify(next)]))
  const r = await db().query("UPDATE wealth.holdings SET current_value = round((meta->>'ounces')::numeric * CASE meta->>'metal' WHEN 'silver' THEN $2::numeric ELSE $1::numeric END, 2), as_of = current_date, updated_at = now() WHERE category = 'precious_metals' AND meta->>'valuation' = 'spot' AND (meta->>'ounces') IS NOT NULL AND CASE meta->>'metal' WHEN 'silver' THEN $2::numeric ELSE $1::numeric END IS NOT NULL", [b.data.gold, b.data.silver])
  await audit({ event, actorUserId: user.userId, action: 'wm.spot', objectType: 'organization', objectId: org.id, detail: b.data })
  return { ok: true, revalued: r.rowCount }
})
