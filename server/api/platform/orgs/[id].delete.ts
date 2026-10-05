// Permanently delete a customer workspace and everything in it. Type the workspace name to confirm. Aidi workspaces
// and the services team's workspace cannot be deleted here.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const staff = await requirePlatform(event, true)
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  const b = z.object({ confirm: z.string().max(200) }).safeParse(await readBody(event))
  if (!id.success || !b.success) throw apiError('invalid', 'Invalid request.')
  const o = (await asPlatform(() => db().query<{ name: string; plan_code: string; operator: string | null }>("SELECT name, plan_code, settings->>'services_operator' AS operator FROM core.organizations WHERE id = $1", [id.data]))).rows[0]
  if (!o) throw apiError('not_found', 'Not found', 404)
  if (o.plan_code === 'internal' || o.operator === 'true') throw apiError('protected', 'Aidi workspaces cannot be deleted here.', 400)
  if (b.data.confirm.trim() !== o.name) throw apiError('confirm', 'Type the workspace name exactly to confirm.', 400)
  try { await asPlatform(() => db().query('SELECT core.delete_organization($1)', [id.data])) } catch (err) { console.error('[platform] delete org failed', err); throw apiError('blocked', 'This workspace could not be fully deleted (some records still refer to it). Close it instead.', 409) }
  await audit({ event, actorUserId: staff.userId, action: 'platform.org_delete', objectType: 'organization', objectId: id.data, detail: { name: o.name } })
  return { ok: true }
})
