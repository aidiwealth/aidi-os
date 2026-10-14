// Admins: save who sees what on the Overview. { visible: { section: role[] } }
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin')
  const b = z.object({ visible: z.record(z.string(), z.array(z.enum(OVERVIEW_ROLES))) }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Invalid request.')
  const keys = new Set(OVERVIEW_SECTIONS.map((s) => s.key))
  const visible = Object.fromEntries(Object.entries(b.data.visible).filter(([k]) => keys.has(k)))
  await db().query("UPDATE core.organizations SET settings = settings || jsonb_build_object('overview_visible', $1::jsonb) WHERE id = core.current_org()", [JSON.stringify(visible)])
  await audit({ event, actorUserId: user.userId, action: 'settings.overview_visible', objectType: 'organization', objectId: user.orgId ?? undefined })
  return { ok: true }
})
