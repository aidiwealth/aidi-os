// The kind of business a company (or entity) is, so its margins are judged against similar companies.
import { z } from 'zod'
import { BUSINESS_MODELS } from '~/shared/business-models'
const Body = z.object({ subject: z.string().regex(/^(entity|company):[0-9a-f-]{36}$/), model: z.enum(BUSINESS_MODELS.map((m) => m.key) as [string, ...string[]]).or(z.literal('')) })
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  const b = Body.safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Choose a business type.')
  await subjectName(b.data.subject)
  const org = (await currentOrg())!
  const all = { ...((org.settings.business_models as Record<string, string> | undefined) ?? {}) }
  if (b.data.model) all[b.data.subject] = b.data.model; else delete all[b.data.subject]
  await asPlatform(() => db().query("UPDATE core.organizations SET settings = settings || jsonb_build_object('business_models', $2::jsonb) WHERE id = $1", [org.id, JSON.stringify(all)]))
  await audit({ event, actorUserId: user.userId, action: 'financials.business_model', objectType: 'organization', objectId: org.id, detail: { subject: b.data.subject, model: b.data.model } })
  return { ok: true }
})
