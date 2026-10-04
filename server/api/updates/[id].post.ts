// Save an update (autosave from the editor), or publish / unpublish it on the investor page.
import { z } from 'zod'
const Block: z.ZodType<unknown> = z.lazy(() => z.object({ type: z.enum(['text', 'chart', 'two_charts', 'metrics_table', 'image', 'video', 'file', 'deck']), md: z.string().max(20000).optional(), title: z.string().max(200).optional(),
  metrics: z.array(z.string().max(40)).max(6).optional(), period: z.enum(['month', 'quarter', 'year']).optional(), count: z.number().int().min(1).max(36).optional(), left: Block.optional(), right: Block.optional(),
  media_id: z.string().uuid().optional(), caption: z.string().max(300).optional(), url: z.string().max(500).optional(), name: z.string().max(200).optional() }))
const Body = z.object({ title: z.string().trim().min(1).max(200), blocks: z.array(Block).max(80).optional(), cover_id: z.string().uuid().nullable().optional(), from_name: z.string().trim().max(120).optional(),
  recipients: z.object({ lists: z.array(z.string().uuid()).max(50), stages: z.array(z.string().uuid()).max(100), contacts: z.array(z.string().uuid()).max(2000), emails: z.array(z.string().max(254)).max(500) }).optional(),
  highlights: z.string().max(4000).optional(), challenges: z.string().max(4000).optional(), asks: z.string().max(2000).optional(), status: z.enum(['draft', 'published']).optional() })
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'team')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  const b = Body.safeParse(await readBody(event))
  if (!id.success || !b.success) throw apiError('invalid', 'Check the update.')
  const d = b.data
  if (d.status === 'published' && !(d.blocks ?? []).length && !(await db().query("SELECT 1 FROM financials.updates WHERE id = $1 AND blocks <> '[]'::jsonb", [id.data])).rowCount) throw apiError('invalid', 'Add some content before publishing.')
  const r = await db().query(`UPDATE financials.updates SET title = $2, blocks = coalesce($3, blocks), cover_id = CASE WHEN $4 THEN $5 ELSE cover_id END, from_name = coalesce($6, from_name), recipients = coalesce($7, recipients),
      highlights = coalesce($8, highlights), challenges = coalesce($9, challenges), asks = coalesce($10, asks), status = coalesce($11, status),
      published_at = CASE WHEN $11 = 'published' THEN coalesce(published_at, now()) WHEN $11 = 'draft' THEN NULL ELSE published_at END, updated_at = now() WHERE id = $1`,
    [id.data, d.title, d.blocks ? JSON.stringify(d.blocks) : null, d.cover_id !== undefined, d.cover_id ?? null, d.from_name ?? null, d.recipients ? JSON.stringify(d.recipients) : null, d.highlights ?? null, d.challenges ?? null, d.asks ?? null, d.status ?? null])
  if (!r.rowCount) throw apiError('not_found', 'Not found', 404)
  if (d.status) await audit({ event, actorUserId: user.userId, action: 'updates.' + d.status, objectType: 'update', objectId: id.data })
  return { ok: true }
})
