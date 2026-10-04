// Add or update an investor in a pipeline. The primary contact is an existing contact, or a new one from name and email.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team')
  const b = z.object({ id: z.string().uuid().optional(), pipeline_id: z.string().uuid(), stage_id: z.string().uuid(), investor: z.string().trim().min(1).max(200), contact_id: z.string().uuid().optional().nullable(),
    contact_name: z.string().trim().max(200).default(''), contact_email: z.string().trim().max(254).default(''), amount: z.union([z.coerce.number().min(0), z.literal('').transform(() => null), z.null()]).optional(), notes: z.string().max(3000).default('') }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Add the investor and stage.')
  const d = b.data
  let contact = d.contact_id ?? null
  if (!contact && d.contact_email) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.contact_email)) throw apiError('invalid', 'Check the contact email.')
    contact = (await one<{ id: string }>('INSERT INTO crm.contacts (name, email, firm) VALUES ($1,$2,$3) ON CONFLICT (organization_id, email) DO UPDATE SET firm = coalesce(crm.contacts.firm, EXCLUDED.firm) RETURNING id', [d.contact_name || d.contact_email.split('@')[0], d.contact_email.toLowerCase(), d.investor])).id
  }
  const args = [d.stage_id, d.investor, contact, d.amount ?? null, d.notes || null]
  if (d.id) await db().query('UPDATE crm.deals SET stage_id = $2, investor = $3, contact_id = $4, amount = $5, notes = $6, updated_at = now() WHERE id = $1', [d.id, ...args])
  else await db().query('INSERT INTO crm.deals (pipeline_id, stage_id, investor, contact_id, amount, notes) VALUES ($1,$2,$3,$4,$5,$6)', [d.pipeline_id, ...args])
  return { ok: true }
})
