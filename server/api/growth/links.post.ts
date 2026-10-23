// Sync a linked sheet now, switch keeping it in step on or off, or unlink it (what it brought in stays).
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const b = z.object({ id: z.string().uuid(), action: z.enum(['sync', 'auto_on', 'auto_off', 'delete']) }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Invalid request.')
  const l = (await db().query<GLink>('SELECT id, kind, process_id, name, url, mapping, auto, last_synced_at::text FROM growth.links WHERE id = $1', [b.data.id])).rows[0]
  if (!l) throw apiError('not_found', 'Not found', 404)
  const user = await requireKind(event, l.kind)
  if (b.data.action === 'delete') { await db().query('DELETE FROM growth.links WHERE id = $1', [l.id]); return { ok: true } }
  if (b.data.action !== 'sync') { await db().query('UPDATE growth.links SET auto = $2 WHERE id = $1', [l.id, b.data.action === 'auto_on']); return { ok: true } }
  return { ok: true, ...(await syncGrowthLink(l, user.userId)) }
})
