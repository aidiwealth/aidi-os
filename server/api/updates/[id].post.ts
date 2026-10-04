// Save the update (title, notes, body), or publish / unpublish it on the investor page.
import { z } from 'zod'
const Body = z.object({ title: z.string().trim().min(1).max(200), highlights: z.string().max(4000).default(''), challenges: z.string().max(4000).default(''), asks: z.string().max(2000).default(''), body: z.string().max(30000).default(''), status: z.enum(['draft', 'published']).optional() })
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  const b = Body.safeParse(await readBody(event))
  if (!id.success || !b.success) throw apiError('invalid', 'Check the update.')
  const d = b.data
  if (d.status === 'published' && !d.body.trim()) throw apiError('invalid', 'Write or generate the update before publishing.')
  const r = await db().query(`UPDATE financials.updates SET title = $2, highlights = $3, challenges = $4, asks = $5, body = $6, status = coalesce($7, status),
      published_at = CASE WHEN $7 = 'published' THEN coalesce(published_at, now()) WHEN $7 = 'draft' THEN NULL ELSE published_at END, updated_at = now() WHERE id = $1`,
    [id.data, d.title, d.highlights || null, d.challenges || null, d.asks || null, d.body || null, d.status ?? null])
  if (!r.rowCount) throw apiError('not_found', 'Not found', 404)
  if (d.status) await audit({ event, actorUserId: user.userId, action: 'updates.' + d.status, objectType: 'update', objectId: id.data })
  return { ok: true }
})
