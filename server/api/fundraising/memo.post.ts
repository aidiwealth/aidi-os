// Create or save a deal memo: { id?, title, notes, body }
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp')
  const b = z.object({ id: z.string().uuid().optional(), title: z.string().trim().min(1).max(200), notes: z.record(z.string(), z.string().max(3000)).default({}), body: z.string().max(40000).default('') }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Check the memo.')
  const d = b.data
  const r = d.id ? await one<{ id: string }>('UPDATE fundraise.memos SET title = $2, notes = $3, body = $4, updated_at = now() WHERE id = $1 RETURNING id', [d.id, d.title, JSON.stringify(d.notes), d.body || null])
    : await one<{ id: string }>('INSERT INTO fundraise.memos (title, notes, body) VALUES ($1,$2,$3) RETURNING id', [d.title, JSON.stringify(d.notes), d.body || null])
  return { ok: true, id: r.id }
})
