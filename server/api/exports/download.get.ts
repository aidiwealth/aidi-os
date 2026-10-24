// Download an export now: up to a month of data (or a snapshot such as the cut list), as Excel or CSV.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp')
  const q = z.object({ kind: z.string().max(40), format: z.enum(['xlsx', 'csv']).default('xlsx'), from: z.string().optional(), to: z.string().optional() }).safeParse(getQuery(event))
  const k = q.success ? EXPORTS[q.data.kind] : undefined
  if (!q.success || !k) throw apiError('invalid', 'Choose what to export.')
  const r = exportRange(k, q.data.from, q.data.to, DIRECT_DAYS)
  const f = await toFile(await k.build(event, r.from, r.to), q.data.format)
  await audit({ event, actorUserId: user.userId, action: 'export.download', objectType: 'export', detail: { kind: q.data.kind, from: r.from, to: r.to, format: q.data.format } })
  setHeader(event, 'content-type', f.mime); setHeader(event, 'content-disposition', 'attachment; filename="' + f.file + '"'); setHeader(event, 'cache-control', 'no-store')
  return f.bytes
})
