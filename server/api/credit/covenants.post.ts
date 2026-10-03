import { z } from 'zod'
const Body = z.object({
  loan_id: z.string().uuid(), title: z.string().trim().min(1).max(200), kind: z.enum(['financial', 'reporting', 'other']),
  threshold: z.string().trim().max(300).optional(), frequency: z.enum(['once', 'monthly', 'quarterly', 'annual']), next_due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
})
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'team')
  const b = Body.safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Add the covenant, its type, how often it is tested and the next date.')
  const d = b.data
  const row = await one<{ id: string }>('INSERT INTO credit.covenants (loan_id, title, kind, threshold, frequency, next_due, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
    [d.loan_id, d.title, d.kind, d.threshold || null, d.frequency, d.next_due, user.userId])
  await audit({ event, actorUserId: user.userId, action: 'credit.covenant_add', objectType: 'loan', objectId: d.loan_id, detail: { title: d.title } })
  return { ok: true, id: row.id }
})
