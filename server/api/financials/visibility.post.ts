// The founder's choice of what investors see about the figures: a financial summary (data room, investor page,
// updates) and, per linked sheet, whether its link is shown as the source.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'admin')
  const b = z.object({ summary: z.boolean().optional(), link_id: z.string().uuid().optional(), show_source: z.boolean().optional() }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Invalid request.')
  const org = (await currentOrg())!
  if (b.data.summary !== undefined) await asPlatform(() => db().query("UPDATE core.organizations SET settings = settings || jsonb_build_object('investor_fin_summary', $2::boolean) WHERE id = $1", [org.id, b.data.summary]))
  if (b.data.link_id && b.data.show_source !== undefined && !(await db().query('UPDATE financials.sheet_links SET show_source = $2 WHERE id = $1', [b.data.link_id, b.data.show_source])).rowCount) throw apiError('not_found', 'Not found', 404)
  await audit({ event, actorUserId: user.userId, action: 'financials.investor_visibility', objectType: 'organization', objectId: org.id, detail: b.data })
  return { ok: true }
})
