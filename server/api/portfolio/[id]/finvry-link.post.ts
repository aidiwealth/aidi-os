// Link (or unlink) a portfolio company to its Finvry workspace.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  if (String(event.context.entityScope ?? '')) throw apiError('forbidden', 'Linking Finvry workspaces needs access to the whole group.', 403)
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  const b = z.object({ org_id: z.string().uuid().nullable().optional(), auto: z.boolean().optional() }).safeParse(await readBody(event))
  if (!id.success || !b.success) throw apiError('invalid', 'Invalid request.')
  if (b.data.org_id === undefined) { if (b.data.auto === undefined) throw apiError('invalid', 'Invalid request.'); await db().query('UPDATE portfolio.companies SET finvry_auto = $2 WHERE id = $1', [id.data, b.data.auto]); return { ok: true } }
  if (b.data.org_id && !(await asPlatform(() => db().query("SELECT 1 FROM core.organizations WHERE id = $1 AND kind = 'company'", [b.data.org_id]))).rowCount) throw apiError('not_found', 'Finvry workspace not found.', 404)
  const r = await db().query('UPDATE portfolio.companies SET finvry_org_id = $2, finvry_new_update = NULL WHERE id = $1', [id.data, b.data.org_id])
  if (!r.rowCount) throw apiError('not_found', 'Not found', 404)
  await audit({ event, actorUserId: user.userId, action: 'portfolio.finvry_link', objectType: 'company', objectId: id.data, detail: { org: b.data.org_id } })
  return { ok: true }
})
