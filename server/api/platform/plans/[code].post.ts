// Activate or deactivate a plan (inactive plans can't be chosen; existing customers keep theirs).
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const staff = await requirePlatform(event, true)
  const code = String(getRouterParam(event, 'code') ?? '')
  const b = z.object({ active: z.boolean() }).safeParse(await readBody(event))
  if (!b.success || !/^[a-z][a-z0-9_]{1,40}$/.test(code)) throw apiError('invalid', 'Invalid request.')
  if (code === 'internal' && !b.data.active) throw apiError('internal', 'The internal plan stays active.')
  const r = await asPlatform(() => db().query('UPDATE core.plans SET active = $2 WHERE code = $1', [code, b.data.active]))
  if (!r.rowCount) throw apiError('not_found', 'Plan not found', 404)
  await audit({ event, actorUserId: staff.userId, action: 'platform.plan_' + (b.data.active ? 'activate' : 'deactivate'), objectType: 'plan', detail: { code } })
  return { ok: true }
})
