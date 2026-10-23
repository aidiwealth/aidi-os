// Sheets linked to Sales, Marketing or Banking.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const q = z.object({ kind: z.enum(['sales_deals', 'marketing_months', 'bank_txns']), process_id: z.string().uuid().optional() }).safeParse(getQuery(event))
  if (!q.success) throw apiError('invalid', 'Invalid request.')
  await requireKind(event, q.data.kind)
  // Bank sheets: the company chosen at the top sees its own; the group view sees them all.
  const sc = await forecastScope(event)
  return (await db().query("SELECT id, name, url, source, auto, last_synced_at, last_result, last_error, (SELECT p.id FROM growth.pending_imports p WHERE p.link_id = growth.links.id LIMIT 1) AS pending_id FROM growth.links WHERE kind = $1 AND ($2::uuid IS NULL OR process_id = $2) AND ($3::uuid IS NULL OR kind <> 'bank_txns' OR coalesce(mapping->>'entity', $4::text) = $3::text) ORDER BY created_at", [q.data.kind, q.data.process_id ?? null, sc.group ? null : sc.entity, await companyEntityId()])).rows
})
