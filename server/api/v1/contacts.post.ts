// POST /api/v1/contacts — add or update contacts (matched by email). Body: { contacts: [{ name, email, firm?, title?, lists?: [names] }] }
import { z } from 'zod'
const One = z.object({ name: z.string().trim().min(1).max(200), email: z.string().trim().toLowerCase().email().max(254), firm: z.string().trim().max(200).optional(), title: z.string().trim().max(120).optional(), lists: z.array(z.string().trim().min(1).max(80)).max(20).optional() })
export default defineEventHandler(async (event) => {
  await requireApiKey(event, 'write')
  const b = z.object({ contacts: z.array(One).min(1).max(1000) }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Send { contacts: [{ name, email, firm?, title?, lists? }] } (up to 1000).', 422)
  let added = 0, updated = 0
  for (const c of b.data.contacts) {
    const r = await db().query<{ id: string; added: boolean }>('INSERT INTO crm.contacts (name, email, firm, title) VALUES ($1,$2,$3,$4) ON CONFLICT (organization_id, email) DO UPDATE SET name = EXCLUDED.name, firm = coalesce(EXCLUDED.firm, crm.contacts.firm), title = coalesce(EXCLUDED.title, crm.contacts.title) RETURNING id, (xmax = 0) AS added', [c.name, c.email, c.firm ?? null, c.title ?? null])
    if (r.rows[0]?.added) added++; else updated++
    for (const ln of c.lists ?? []) { const l = await one<{ id: string }>('INSERT INTO crm.lists (name) VALUES ($1) ON CONFLICT (organization_id, name) DO UPDATE SET name = EXCLUDED.name RETURNING id', [ln]); await db().query('INSERT INTO crm.list_members (list_id, contact_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [l.id, r.rows[0]!.id]) }
  }
  return { ok: true, added, updated }
})
