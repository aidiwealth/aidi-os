// Change a team member's name (admins). The name is the person's own, so it shows the same everywhere they appear.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const admin = await requireRole(event, 'admin')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  const b = z.object({ full_name: z.string().trim().min(1).max(200) }).safeParse(await readBody(event))
  if (!id.success || !b.success) throw apiError('invalid', 'Enter a name.')
  const u = (await db().query<{ person_id: string | null; email: string }>('SELECT u.person_id, u.email FROM core.users u JOIN core.memberships m ON m.user_id = u.id AND m.organization_id = core.current_org() WHERE u.id = $1', [id.data])).rows[0]
  if (!u) throw apiError('not_found', 'User not found', 404)
  if (u.person_id) await db().query('UPDATE core.people SET full_name = $2 WHERE id = $1', [u.person_id, b.data.full_name])
  else {
    const p = await one<{ id: string }>("INSERT INTO core.people (full_name, email, kind) VALUES ($1, $2, 'team') ON CONFLICT (email) WHERE email IS NOT NULL DO UPDATE SET full_name = EXCLUDED.full_name RETURNING id", [b.data.full_name, u.email])
    await db().query('UPDATE core.users SET person_id = $2 WHERE id = $1', [id.data, p.id])
  }
  await audit({ event, actorUserId: admin.userId, action: 'user.rename', objectType: 'user', objectId: id.data, detail: { full_name: b.data.full_name } })
  return { ok: true }
})
