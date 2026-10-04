// Save the custom properties: the full list, in order.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp')
  const b = z.object({ fields: z.array(z.object({ label: z.string().trim().min(1).max(60), type: z.enum(['text', 'number', 'date', 'select', 'url']), options: z.array(z.string().trim().min(1).max(60)).max(30).default([]) })).max(30) }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Check the properties.')
  const keys: string[] = []
  for (const [i, f] of b.data.fields.entries()) {
    const key = (f.label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'field').replace(/^[^a-z]/, 'f_').slice(0, 40)
    keys.push(key)
    await db().query('INSERT INTO crm.fields (key, label, type, options, sort) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (organization_id, key) DO UPDATE SET label = EXCLUDED.label, type = EXCLUDED.type, options = EXCLUDED.options, sort = EXCLUDED.sort', [key, f.label, f.type, f.options, i])
  }
  await db().query('DELETE FROM crm.fields WHERE NOT (key = ANY($1::text[]))', [keys])
  return { ok: true }
})
