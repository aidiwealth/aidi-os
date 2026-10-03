import { z } from 'zod'
const Body = z.object({
  name: z.string().trim().min(1).max(200), country: z.string().trim().max(100).optional(), sector: z.string().trim().max(100).optional(),
  contact_name: z.string().trim().max(200).optional(), contact_email: z.string().trim().email().max(254).optional().or(z.literal('').transform(() => undefined))
})
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'team')
  const b = Body.safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Add the borrower name.')
  const d = b.data
  const row = await one<{ id: string }>('INSERT INTO credit.borrowers (name, country, sector, contact_name, contact_email, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
    [d.name, d.country || null, d.sector || null, d.contact_name || null, d.contact_email?.toLowerCase() ?? null, user.userId])
  await audit({ event, actorUserId: user.userId, action: 'credit.borrower_add', objectType: 'borrower', objectId: row.id, detail: { name: d.name } })
  return { ok: true, id: row.id }
})
