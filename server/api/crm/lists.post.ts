import { z } from 'zod'
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team')
  const b = z.object({ id: z.string().uuid().optional(), name: z.string().trim().min(1).max(80) }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Name the list.')
  try {
    if (b.data.id) { await db().query('UPDATE crm.lists SET name = $2 WHERE id = $1', [b.data.id, b.data.name]); return { ok: true, id: b.data.id } }
    return { ok: true, id: (await one<{ id: string }>('INSERT INTO crm.lists (name) VALUES ($1) RETURNING id', [b.data.name])).id }
  } catch { throw apiError('exists', 'A list with that name already exists.', 409) }
})
