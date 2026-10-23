// Accept monthly figures drafted from the bank (only months without the company's own figures).
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  const b = z.object({ subject: z.string().regex(/^entity:[0-9a-f-]{36}$/), months: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).min(1).max(36) }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Choose the months.')
  await subjectName(b.data.subject)
  const r = await writeBankDraft(b.data.subject.slice(7), b.data.months, user.userId)
  await audit({ event, actorUserId: user.userId, action: 'financials.from_bank', objectType: 'subject', detail: { subject: b.data.subject, months: r.written } })
  return { ok: true, ...r }
})
