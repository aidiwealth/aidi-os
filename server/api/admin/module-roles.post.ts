// Admins: choose which roles can use a module in this workspace (admins always can). Empty list resets to the default.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin')
  const b = z.object({ code: z.string().max(40), roles: z.array(z.enum(['gp', 'team', 'family', 'adviser', 'services', 'founder', 'investor'])).max(8) }).safeParse(await readBody(event))
  if (!b.success || !MODULES.some((m) => m.code === b.data.code)) throw apiError('invalid', 'Invalid request.')
  const org = (await currentOrg())!
  const cur = { ...((org.settings as Record<string, unknown>).module_roles as Record<string, string[]> | undefined ?? {}) }
  if (b.data.roles.length) cur[b.data.code] = b.data.roles; else delete cur[b.data.code]
  await asPlatform(() => db().query("UPDATE core.organizations SET settings = settings || jsonb_build_object('module_roles', $2::jsonb) WHERE id = $1", [org.id, JSON.stringify(cur)]))
  await audit({ event, actorUserId: user.userId, action: 'modules.roles', objectType: 'module', objectId: undefined, detail: { code: b.data.code, roles: b.data.roles } })
  return { ok: true }
})
