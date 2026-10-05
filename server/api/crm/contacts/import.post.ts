// Paste contacts, one per line: "Name <email>", "Name, email, firm, title" or a CSV with a header row. Optional list.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team')
  const b = z.object({ lines: z.string().max(200000), list_id: z.string().uuid().optional() }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Paste at least one contact.')
  let added = 0, seen = 0
  for (const raw of b.data.lines.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 5000)) {
    const email = raw.match(/[^\s<>,;"]+@[^\s<>,;"]+\.[^\s<>,;"]+/)?.[0]?.toLowerCase()
    if (!email) continue
    seen++
    const parts = raw.replace(/[<>"]/g, ' ').split(/[,;\t]/).map((s) => s.trim()), at = parts.findIndex((s) => s.toLowerCase().includes(email))
    const cut = (x: string) => { const i = x.toLowerCase().indexOf(email); return (i < 0 ? x : x.slice(0, i) + x.slice(i + email.length)).replace(/\s+/g, ' ').trim() }
    const rest = at >= 0 ? [cut(parts.slice(0, at + 1).join(' ')), parts[at + 1] ?? '', parts[at + 2] ?? ''] : ['', '', '']
    const r = await db().query<{ id: string; added: boolean }>('INSERT INTO crm.contacts (name, email, firm, title) VALUES ($1,$2,$3,$4) ON CONFLICT (organization_id, email) DO UPDATE SET firm = coalesce(crm.contacts.firm, EXCLUDED.firm) RETURNING id, (xmax = 0) AS added',
      [(rest[0] || email.split('@')[0]!).slice(0, 200), email, (rest[1] ?? '').slice(0, 200) || null, (rest[2] ?? '').slice(0, 120) || null])
    if (r.rows[0]?.added) added++
    if (b.data.list_id && r.rows[0]) await db().query('INSERT INTO crm.list_members (list_id, contact_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [b.data.list_id, r.rows[0].id])
  }
  if (!seen) throw apiError('invalid', 'No email addresses found.')
  return { ok: true, added, updated: seen - added }
})
