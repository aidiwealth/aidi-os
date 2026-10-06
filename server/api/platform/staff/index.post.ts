// Console owners: give or remove Finvry console access (owner, sales or support) for a member.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const s = await requirePlatform(event, true)
  if (s.staffRole !== 'owner') throw apiError('forbidden', 'Only console owners can change console access.', 403)
  const b = z.object({ user_id: z.string().uuid(), role: z.enum(['owner', 'sales', 'support']).nullable() }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Invalid request.')
  if (b.data.user_id === s.userId && b.data.role !== 'owner') throw apiError('invalid', 'You cannot remove your own owner access.', 400)
  if (b.data.role) await asPlatform(() => db().query('INSERT INTO core.platform_staff (user_id, role) VALUES ($1,$2) ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role', [b.data.user_id, b.data.role]))
  else await asPlatform(() => db().query('DELETE FROM core.platform_staff WHERE user_id = $1', [b.data.user_id]))
  await audit({ event, actorUserId: s.userId, action: 'platform.staff_' + (b.data.role ?? 'removed'), objectType: 'user', objectId: b.data.user_id })
  return { ok: true }
})
