// Console: switch managed fundraising on or off for a customer workspace and set the success fee.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const staff = await requirePlatform(event, true)
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  const b = z.object({ enabled: z.boolean(), fee_pct: z.number().min(0).max(30).default(4) }).safeParse(await readBody(event))
  if (!id.success || !b.success) throw apiError('invalid', 'Invalid request.')
  await asPlatform(() => db().query("UPDATE core.organizations SET settings = settings || jsonb_build_object('raise_enabled', $2::boolean, 'raise_fee_pct', $3::numeric) WHERE id = $1 AND kind = 'company'", [id.data, b.data.enabled, b.data.fee_pct]))
  if (b.data.enabled) await clientForWorkspace(id.data)
  await audit({ event, actorUserId: staff.userId, action: 'platform.raise_' + (b.data.enabled ? 'on' : 'off'), objectType: 'organization', objectId: id.data, detail: { fee_pct: b.data.fee_pct } })
  return { ok: true }
})
