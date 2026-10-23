// Updates waiting for review (from a sheet, a file or a CRM) for Sales, Marketing or Banking.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const q = z.object({ kind: z.enum(['sales_deals', 'marketing_months', 'bank_txns']), process_id: z.string().uuid().optional() }).safeParse(getQuery(event))
  if (!q.success) throw apiError('invalid', 'Invalid request.')
  await requireKind(event, q.data.kind)
  // Updates nobody looked at for a month are dropped (a later read brings them back if they still apply).
  await db().query("DELETE FROM growth.pending_imports WHERE created_at < now() - interval '30 days'")
  return (await db().query("SELECT p.id, p.name, p.summary, p.created_at, p.link_id, l.source FROM growth.pending_imports p LEFT JOIN growth.links l ON l.id = p.link_id WHERE p.kind = $1 AND ($2::uuid IS NULL OR p.process_id = $2) ORDER BY p.created_at DESC LIMIT 10", [q.data.kind, q.data.process_id ?? null])).rows
})
