// Sheets linked to Sales, Marketing or Banking.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const q = z.object({ kind: z.enum(['sales_deals', 'marketing_months', 'bank_txns']), process_id: z.string().uuid().optional() }).safeParse(getQuery(event))
  if (!q.success) throw apiError('invalid', 'Invalid request.')
  await requireKind(event, q.data.kind)
  return (await db().query("SELECT id, name, url, auto, last_synced_at, last_result, last_error FROM growth.links WHERE kind = $1 AND ($2::uuid IS NULL OR process_id = $2) ORDER BY created_at", [q.data.kind, q.data.process_id ?? null])).rows
})
