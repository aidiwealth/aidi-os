// The services team edits an agreement's wording (a new version for everything signed from now on), or resets it.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireOperator(event)
  const b = z.object({ code: z.enum(AGREEMENT_CODES), title: z.string().trim().min(1).max(200).optional(), body: z.string().trim().min(50).max(100000).optional(), reset: z.boolean().default(false) }).safeParse(await readBody(event))
  if (!b.success || (!b.data.reset && (!b.data.title || !b.data.body))) throw apiError('invalid', 'Add a title and the agreement text.')
  if (b.data.reset) await resetAgreementTemplate(b.data.code, user.userId)
  else await saveAgreementTemplate(b.data.code, b.data.title!, b.data.body!, user.userId)
  await audit({ event, actorUserId: user.userId, action: 'services.agreement_template_' + (b.data.reset ? 'reset' : 'saved'), objectType: 'agreement_template', objectId: b.data.code })
  return { ok: true, template: await agreementTemplate(b.data.code) }
})
