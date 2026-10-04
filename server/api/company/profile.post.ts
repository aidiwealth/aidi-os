// Company profile: legal form and state. Adds the standard filing reminders for that form (never duplicates them).
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  const org = (await currentOrg())!
  if (org.kind !== 'company') throw apiError('not_found', 'Not found', 404)
  const b = z.object({ entity_type: z.enum(['us_llc', 'us_corp', 'ng_ltd', 'other']), state: z.string().max(40).default(''), seed: z.boolean().default(true) }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Choose your company type.')
  await asPlatform(() => db().query("UPDATE core.organizations SET settings = settings || jsonb_build_object('entity_type', $2::text, 'state', $3::text) WHERE id = $1", [org.id, b.data.entity_type, b.data.state]))
  const added = b.data.seed ? await seedCompanyCompliance(b.data.entity_type, b.data.state) : 0
  await audit({ event, actorUserId: user.userId, action: 'company.profile', objectType: 'organization', objectId: org.id, detail: { ...b.data, added } })
  return { ok: true, added }
})
