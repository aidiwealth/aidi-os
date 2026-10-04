// How many people an update would reach with these recipients (unsubscribed contacts left out).
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team')
  const b = z.object({ lists: z.array(z.string().uuid()).max(50), stages: z.array(z.string().uuid()).max(100), contacts: z.array(z.string().uuid()).max(2000), emails: z.array(z.string().max(254)).max(500) }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Invalid recipients.')
  const r = await resolveRecipients(b.data)
  return { count: r.length, sample: r.slice(0, 8) }
})
