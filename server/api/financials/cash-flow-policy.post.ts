// The founder's answer: work out the cash flow statement from the P&L and balance sheet (yes) or not (no). Asked once.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  const b = z.object({ subject: z.string().regex(/^(entity|company):[0-9a-f-]{36}$/), on: z.boolean() }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Choose yes or no.')
  await subjectName(b.data.subject)
  const org = (await currentOrg())!
  const all = { ...((org.settings.cf_auto as Record<string, boolean> | undefined) ?? {}), [b.data.subject]: b.data.on }
  await asPlatform(() => db().query("UPDATE core.organizations SET settings = settings || jsonb_build_object('cf_auto', $2::jsonb) WHERE id = $1", [org.id, JSON.stringify(all)]))
  await audit({ event, actorUserId: user.userId, action: 'financials.cash_flow_policy', objectType: 'organization', objectId: org.id, detail: b.data })
  return { ok: true }
})
