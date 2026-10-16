// Admins: the risk rating of each asset class (1 very low to 5 very high) and, for each client risk level, the
// riskiest rating allowed and the most that may sit in high-risk assets (rating 4 or 5).
import { z } from 'zod'
import { ASSET_CLASSES, RISK_LEVELS } from '~/shared/risk'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin')
  const r = z.number().int().min(1).max(5)
  const b = z.object({ ratings: z.record(z.string(), r), limits: z.record(z.string(), z.object({ max_rating: r, max_high_pct: z.number().min(0).max(100) })) }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Check the ratings and limits.')
  const ratings = Object.fromEntries(ASSET_CLASSES.map((a) => [a.code, b.data.ratings[a.code] ?? a.rating]))
  const limits = Object.fromEntries(RISK_LEVELS.map((l) => [l.code, b.data.limits[l.code]]).filter(([, v]) => v))
  if (Object.keys(limits).length !== RISK_LEVELS.length) throw apiError('invalid', 'Set limits for every risk level.')
  const org = (await currentOrg())!
  await asPlatform(() => db().query("UPDATE core.organizations SET settings = settings || jsonb_build_object('wm_risk', $2::jsonb) WHERE id = $1", [org.id, JSON.stringify({ ratings, limits })]))
  await audit({ event, actorUserId: user.userId, action: 'wm.risk_settings', objectType: 'organization', objectId: org.id, detail: { ratings, limits } })
  return { ok: true }
})
