// Make, copy, rename, set as main, or delete a cap table.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp', 'team')
  const b = z.object({ action: z.enum(['create', 'copy', 'rename', 'main', 'delete']), id: z.string().uuid().optional(), name: z.string().trim().min(1).max(120).optional(), note: z.string().trim().max(1000).optional() }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Name the cap table.')
  const d = b.data
  let id = d.id ?? ''
  if (d.action === 'create') id = (await one<{ id: string }>('INSERT INTO equity.captables (name, note, is_main, created_by) VALUES ($1, $2, NOT EXISTS (SELECT 1 FROM equity.captables), $3) RETURNING id', [d.name ?? 'New cap table', d.note || null, user.userId])).id
  else {
    if (!d.id) throw apiError('invalid', 'Choose a cap table.')
    if (d.action === 'copy') id = await copyCapTable(d.id, d.name ?? 'Copy', user.userId)
    else if (d.action === 'rename') { if (!(await db().query('UPDATE equity.captables SET name = coalesce($2, name), note = $3, updated_at = now() WHERE id = $1', [d.id, d.name ?? null, d.note || null])).rowCount) throw apiError('not_found', 'Not found', 404) }
    else if (d.action === 'main') { await db().query('UPDATE equity.captables SET is_main = (id = $1)', [d.id]) }
    else {
      const was = (await db().query<{ is_main: boolean }>('DELETE FROM equity.captables WHERE id = $1 RETURNING is_main', [d.id])).rows[0]
      if (!was) throw apiError('not_found', 'Not found', 404)
      await db().query("UPDATE financials.share_links SET active = false WHERE kind = 'captable' AND object_id = $1", [d.id])
      if (was.is_main) await db().query('UPDATE equity.captables SET is_main = true WHERE id = (SELECT id FROM equity.captables ORDER BY created_at LIMIT 1)')
    }
  }
  await audit({ event, actorUserId: user.userId, action: 'equity.captable_' + d.action, objectType: 'equity_captable', objectId: id || undefined })
  return { ok: true, id }
})
