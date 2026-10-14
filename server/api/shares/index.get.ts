// The private links for one forecast or cap table, with every visit.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin', 'gp', 'team')
  const q = z.object({ kind: z.enum(['forecast', 'captable']), id: z.string().uuid() }).safeParse(getQuery(event))
  if (!q.success) throw apiError('invalid', 'Invalid request.')
  await requireModule(event, q.data.kind === 'forecast' ? 'forecast' : 'equity')
  const links = (await db().query<{ id: string; token: string; label: string; require_email: boolean; notify: boolean; active: boolean; expires_at: string | null; views: number; last_viewed_at: string | null; created_at: string }>(
    'SELECT id, token, label, require_email, notify, active, expires_at, views, last_viewed_at, created_at FROM financials.share_links WHERE kind = $1 AND object_id = $2 ORDER BY created_at DESC', [q.data.kind, q.data.id])).rows
  const visits = links.length ? (await db().query<{ link_id: string; email: string | null; name: string | null; started_at: string; last_at: string; seconds: number }>(
    'SELECT link_id, email, name, started_at, last_at, seconds FROM financials.share_views WHERE link_id = ANY($1::uuid[]) ORDER BY started_at DESC LIMIT 500', [links.map((l) => l.id)])).rows : []
  return { links: links.map(({ token, ...l }) => ({ ...l, url: shareUrl(token), visits: visits.filter((v) => v.link_id === l.id).map(({ link_id, ...v }) => v) })) }
})
