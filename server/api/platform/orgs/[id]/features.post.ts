// Console: switch on Startup or Scale features for a workspace without changing its plan (kept in settings.extra_modules).
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const staff = await requirePlatform(event, true)
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  const b = z.object({ modules: z.array(z.string().max(40)).max(60) }).safeParse(await readBody(event))
  if (!id.success || !b.success) throw apiError('invalid', 'Invalid request.')
  const paid = new Set((await asPlatform(() => db().query<{ modules: string[] }>("SELECT modules FROM core.plans WHERE code IN ('company_startup', 'company_scale')"))).rows.flatMap((r) => r.modules))
  const mods = [...new Set(b.data.modules.filter((m) => paid.has(m) && MODULES.some((x) => x.code === m && x.switchable)))]
  await asPlatform(() => db().query("UPDATE core.organizations SET settings = settings || jsonb_build_object('extra_modules', $2::jsonb) WHERE id = $1", [id.data, JSON.stringify(mods)]))
  clearModuleCache()
  await audit({ event, actorUserId: staff.userId, action: 'platform.features_granted', objectType: 'organization', objectId: id.data, detail: { modules: mods } })
  return { ok: true, modules: mods }
})
