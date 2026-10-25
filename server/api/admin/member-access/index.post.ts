// Team page: switch features off (or back on) for one member. Admins always keep everything.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin')
  const b = z.object({ user_id: z.string().uuid(), off: z.array(z.string().max(40)).max(40) }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Invalid request.')
  const org = (await currentOrg())!
  if (org.kind !== 'company') throw apiError('not_found', 'Not found', 404)
  const member = (await db().query<{ admin: boolean }>("SELECT EXISTS (SELECT 1 FROM core.user_roles WHERE user_id = $1 AND role_code = 'admin') AS admin FROM core.memberships WHERE user_id = $1", [b.data.user_id])).rows[0]
  if (!member) throw apiError('not_found', 'That person is not on this team.', 404)
  if (member.admin) throw apiError('invalid', 'Admins always have access to everything.')
  const codes = [...new Set(MEMBER_FEATURES.filter((f) => b.data.off.includes(f.key)).flatMap((f) => f.codes))]
  const cur = { ...(await memberBlocks()) }
  if (codes.length) cur[b.data.user_id] = codes; else delete cur[b.data.user_id]
  await asPlatform(() => db().query("UPDATE core.organizations SET settings = settings || jsonb_build_object('member_modules', $2::jsonb) WHERE id = $1", [org.id, JSON.stringify(cur)]))
  await audit({ event, actorUserId: user.userId, action: 'team.access', objectType: 'user', objectId: b.data.user_id, detail: { off: b.data.off } })
  return { ok: true, off: b.data.off.filter((k) => MEMBER_FEATURES.some((f) => f.key === k)) }
})
