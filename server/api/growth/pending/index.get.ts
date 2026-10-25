// Bank transaction updates waiting for review (from a sheet or a file).
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const q = z.object({ kind: z.enum(['bank_txns']) }).safeParse(getQuery(event))
  if (!q.success) throw apiError('invalid', 'Invalid request.')
  await requireKind(event, q.data.kind)
  // Updates nobody looked at for a month are dropped (a later read brings them back if they still apply).
  await db().query("DELETE FROM growth.pending_imports WHERE created_at < now() - interval '30 days'")
  return (await db().query("SELECT p.id, p.name, p.summary, p.created_at, p.link_id FROM growth.pending_imports p WHERE p.kind = $1 ORDER BY p.created_at DESC LIMIT 10", [q.data.kind])).rows
})
