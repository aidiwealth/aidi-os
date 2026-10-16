// Add or update an investor in a pipeline. The primary contact is an existing contact, or a new one from name and email.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team')
  const b = z.object({ id: z.string().uuid().optional(), pipeline_id: z.string().uuid(), stage_id: z.string().uuid(), investor: z.string().trim().min(1).max(200), contact_id: z.string().uuid().optional().nullable(),
    contact_name: z.string().trim().max(200).default(''), contact_email: z.string().trim().max(254).default(''), amount: z.preprocess((v) => (typeof v === 'string' ? v.replace(/[,\s$₦]/g, '') : v), z.union([z.literal('').transform(() => null), z.coerce.number().min(0), z.null()])).optional(), notes: z.string().max(3000).default(''),
    valuation_cap: z.preprocess((v) => (typeof v === 'string' ? v.replace(/[,\s$₦]/g, '') : v), z.union([z.literal('').transform(() => null), z.coerce.number().positive(), z.null()])).optional(),
    cap_basis: z.enum(['post', 'pre']).default('post'), discount: z.preprocess((v) => (typeof v === 'string' ? v.replace(/[%\s]/g, '') : v), z.union([z.literal('').transform(() => null), z.coerce.number().min(0).max(99), z.null()])).optional() }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', b.error.issues.some((i) => i.path[0] === 'amount') ? 'Enter the amount as a number, e.g. 25000.' : b.error.issues.some((i) => i.path[0] === 'valuation_cap') ? 'Enter the cap as a number, e.g. 8000000.' : b.error.issues.some((i) => i.path[0] === 'discount') ? 'Enter the discount as a percentage, e.g. 20.' : 'Add the investor and stage.')
  const d = b.data
  let contact = d.contact_id ?? null
  if (!contact && d.contact_email) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.contact_email)) throw apiError('invalid', 'Check the contact email.')
    contact = (await one<{ id: string }>('INSERT INTO crm.contacts (name, email, firm) VALUES ($1,$2,$3) ON CONFLICT (organization_id, email) DO UPDATE SET firm = coalesce(crm.contacts.firm, EXCLUDED.firm) RETURNING id', [d.contact_name || d.contact_email.split('@')[0], d.contact_email.toLowerCase(), d.investor])).id
  }
  const args = [d.stage_id, d.investor, contact, d.amount ?? null, d.notes || null, d.valuation_cap ?? null, d.valuation_cap ? d.cap_basis : null, d.discount || null]
  if (d.id) await db().query('UPDATE crm.deals SET stage_id = $2, investor = $3, contact_id = $4, amount = $5, notes = $6, valuation_cap = $7, cap_basis = $8, discount = $9, updated_at = now() WHERE id = $1', [d.id, ...args])
  else await db().query('INSERT INTO crm.deals (pipeline_id, stage_id, investor, contact_id, amount, notes, valuation_cap, cap_basis, discount) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [d.pipeline_id, ...args])
  await noteInvestor((await currentOrg())!.id, d.investor)
  return { ok: true }
})
