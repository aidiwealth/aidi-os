import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'team')
  const b = z.object({ contact_id: z.string().uuid(), body: z.string().trim().min(1).max(5000) }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Write a note.')
  await db().query('INSERT INTO crm.notes (contact_id, body, created_by) VALUES ($1,$2,$3)', [b.data.contact_id, b.data.body, user.userId])
  return { ok: true }
})
