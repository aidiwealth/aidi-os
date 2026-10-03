// Switch a module on or off: { code, enabled }
import { z } from 'zod'
const Body = z.object({ code: z.string(), enabled: z.boolean() })
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin')
  const b = Body.safeParse(await readBody(event))
  const m = b.success ? MODULES.find((x) => x.code === b.data.code) : undefined
  if (!b.success || !m || !m.switchable) throw apiError('invalid', 'Unknown module.')
  if (b.data.enabled && !(await planModules()).has(m.code)) throw apiError('not_in_plan', 'This module is not included in your plan.', 403)
  await db().query('INSERT INTO core.modules (code, enabled, updated_by, updated_at) VALUES ($1,$2,$3, now()) ON CONFLICT (organization_id, code) DO UPDATE SET enabled = EXCLUDED.enabled, updated_by = EXCLUDED.updated_by, updated_at = now()',
    [m.code, b.data.enabled, user.userId])
  clearModuleCache()
  await audit({ event, actorUserId: user.userId, action: b.data.enabled ? 'module.enable' : 'module.disable', objectType: 'module', objectId: m.code })
  return { ok: true }
})
