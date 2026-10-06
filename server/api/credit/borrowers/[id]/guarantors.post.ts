// Add a guarantor (usually a founder) to a borrower; BVN and NIN stored encrypted.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'team')
  const id = String(getRouterParam(event, 'id') ?? '')
  const b = z.object({ name: z.string().trim().min(1).max(200), email: z.string().trim().max(254).default(''), phone: z.string().trim().max(30).default(''), relationship: z.string().trim().max(60).default('Founder'), bvn: z.string().trim().regex(/^(\d{11})?$/).default(''), nin: z.string().trim().regex(/^(\d{11})?$/).default(''), check: z.boolean().default(true) }).safeParse(await readBody(event))
  if (!/^[0-9a-f-]{36}$/.test(id) || !b.success) throw apiError('invalid', 'Check the name, and that BVN and NIN have 11 digits.')
  const d = b.data
  const g = await one<{ id: string }>('INSERT INTO credit.guarantors (borrower_id, name, email, phone, relationship, bvn_enc, bvn_last4, nin_enc, nin_last4) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',
    [id, d.name, d.email || null, d.phone || null, d.relationship, d.bvn ? encryptText(d.bvn) : null, d.bvn ? d.bvn.slice(-4) : null, d.nin ? encryptText(d.nin) : null, d.nin ? d.nin.slice(-4) : null])
  let check = null
  if (d.check && d.bvn) check = await runCheck(id, g.id, 'individual', d.bvn, user.userId)
  await audit({ event, actorUserId: user.userId, action: 'credit.guarantor_add', objectType: 'borrower', objectId: id })
  return { ok: true, id: g.id, check }
})
