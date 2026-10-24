// Rename the group (the company and its subsidiaries together), the main company or a subsidiary (admins). The main
// company's new name becomes the workspace's name too. The group's name can be cleared to go back to "<main> group".
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin')
  const org = await currentOrg()
  if (org?.kind !== 'company') throw apiError('not_found', 'Not found', 404)
  const b = z.object({ target: z.union([z.literal('group'), z.string().uuid()]), name: z.string().trim().max(120) }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Enter a name.')
  const { target, name } = b.data
  if (target === 'group') {
    await db().query("UPDATE core.organizations SET settings = CASE WHEN $1 = '' THEN settings - 'group_name' ELSE settings || jsonb_build_object('group_name', $1::text) END WHERE id = core.current_org()", [name])
  } else {
    if (!name) throw apiError('invalid', 'Enter a name.')
    const e = (await db().query<{ id: string; main: boolean; name: string }>("SELECT id, parent_id IS NULL AS main, name FROM core.entities WHERE id = $1 AND kind = 'operating'", [target])).rows[0]
    if (!e) throw apiError('not_found', 'Company not found.', 404)
    // Someone limited to some companies can rename only those.
    const scope = String(event.context.entityScope ?? '').split(',').filter(Boolean)
    if (scope.length && !scope.includes(e.id)) throw apiError('forbidden', 'You cannot rename this company.', 403)
    await db().query('UPDATE core.entities SET name = $2 WHERE id = $1', [e.id, name])
    if (e.main) await db().query('UPDATE core.organizations SET name = $1 WHERE id = core.current_org()', [name])
  }
  await audit({ event, actorUserId: user.userId, action: 'company.rename', objectType: target === 'group' ? 'organization' : 'entity', objectId: target === 'group' ? undefined : target, detail: { name } })
  return { ok: true }
})
