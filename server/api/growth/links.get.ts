// Sheets linked to Banking.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const q = z.object({ kind: z.enum(['bank_txns']) }).safeParse(getQuery(event))
  if (!q.success) throw apiError('invalid', 'Invalid request.')
  await requireKind(event, q.data.kind)
  // Bank sheets: the company chosen at the top sees its own; the group view sees them all.
  const sc = await forecastScope(event)
  return (await db().query("SELECT id, name, url, auto, last_synced_at, last_result, last_error, (SELECT p.id FROM growth.pending_imports p WHERE p.link_id = growth.links.id LIMIT 1) AS pending_id FROM growth.links WHERE kind = $1 AND ($2::uuid IS NULL OR coalesce(mapping->>'entity', $3::text) = $2::text) ORDER BY created_at", [q.data.kind, sc.group ? null : sc.entity, await companyEntityId()])).rows
})
