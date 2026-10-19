// Whether the company is one company (one entity) or a group with subsidiaries. Asked once on Financials; changeable.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'admin')
  const b = z.object({ structure: z.enum(['single', 'group']) }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Choose one company or a group.')
  const org = (await currentOrg())!
  if (org.kind !== 'company') throw apiError('invalid', 'Only for companies.')
  await asPlatform(() => db().query("UPDATE core.organizations SET settings = settings || jsonb_build_object('structure', $2::text) WHERE id = $1", [org.id, b.data.structure]))
  await audit({ event, actorUserId: user.userId, action: 'company.structure', objectType: 'organization', objectId: org.id, detail: b.data })
  return { ok: true }
})
