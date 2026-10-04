// Add investors: one, or several pasted as "Name <email>" / "Name, email, firm" lines.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp')
  const b = z.object({ lines: z.string().max(20000) }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Add at least one investor.')
  let added = 0
  for (const raw of b.data.lines.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 500)) {
    const email = raw.match(/[^\s<>,;]+@[^\s<>,;]+\.[^\s<>,;]+/)?.[0]?.toLowerCase()
    if (!email) continue
    const rest = raw.replace(email, '').replace(/[<>]/g, '').split(',').map((s) => s.trim()).filter(Boolean)
    const r = await db().query('INSERT INTO financials.investors (name, email, firm) VALUES ($1,$2,$3) ON CONFLICT (organization_id, email) DO NOTHING', [(rest[0] || email.split('@')[0]!).slice(0, 200), email, (rest[1] ?? '').slice(0, 200) || null])
    added += r.rowCount ?? 0
  }
  if (!added) throw apiError('invalid', 'No new email addresses found.')
  return { ok: true, added }
})
