// Console: grant extra storage (GB) to a workspace, on top of its plan and packs.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const staff = await requirePlatform(event, true)
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id')); const b = z.object({ extra_gb: z.number().int().min(0).max(10000) }).safeParse(await readBody(event))
  if (!id.success || !b.success) throw apiError('invalid', 'Enter a number of GB.')
  await asPlatform(() => db().query("UPDATE core.organizations SET settings = settings || jsonb_build_object('extra_storage_gb', $2::int) WHERE id = $1", [id.data, b.data.extra_gb]))
  await audit({ event, actorUserId: staff.userId, action: 'platform.storage_extra', objectType: 'organization', objectId: id.data, detail: { extra_gb: b.data.extra_gb } })
  return { ok: true }
})
