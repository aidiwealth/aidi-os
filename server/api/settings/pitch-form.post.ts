// Admins: the public page where founders pitch (e.g. https://aidiventures.com/pitch).
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin')
  const b = z.object({ url: z.string().trim().max(500).refine((v) => v === '' || /^https:\/\/[^\s]+$/.test(v), 'Use a full https:// address') }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Enter a full https:// address.')
  await db().query("UPDATE core.organizations SET settings = settings || jsonb_build_object('pitch_form_url', $1::text) WHERE id = core.current_org()", [b.data.url])
  await audit({ event, actorUserId: user.userId, action: 'settings.pitch_form', objectType: 'organization', objectId: user.orgId ?? undefined })
  return { ok: true }
})
