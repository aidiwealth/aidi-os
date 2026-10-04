// Duplicate an update, save it as a template, or start a new update from a template.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'team')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  const b = z.object({ as: z.enum(['copy', 'template', 'from_template']).default('copy') }).safeParse(await readBody(event))
  if (!id.success || !b.success) throw apiError('invalid', 'Invalid request.')
  const r = await one<{ id: string }>(`INSERT INTO financials.updates (title, period_type, period_end, blocks, cover_id, from_name, recipients, highlights, challenges, asks, created_by, is_template)
    SELECT CASE WHEN $2 = 'copy' THEN 'Copy of ' || title WHEN $2 = 'template' THEN title ELSE regexp_replace(title, '^Template: ', '') END, period_type, CASE WHEN $2 = 'from_template' THEN (date_trunc('month', current_date) - interval '1 day')::date ELSE period_end END,
      blocks, cover_id, from_name, recipients, highlights, challenges, asks, $3, $2 = 'template' FROM financials.updates WHERE id = $1 RETURNING id`, [id.data, b.data.as, user.userId])
  return { ok: true, id: r.id }
})
