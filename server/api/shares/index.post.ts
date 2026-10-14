// Make, change, turn off or delete a private link to a forecast or cap table.
import { randomBytes } from 'node:crypto'
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp', 'team')
  const b = z.object({ action: z.enum(['create', 'update', 'delete']), kind: z.enum(['forecast', 'captable']), object_id: z.string().uuid(), id: z.string().uuid().optional(), label: z.string().trim().min(1).max(120).optional(),
    require_email: z.boolean().optional(), notify: z.boolean().optional(), active: z.boolean().optional(), expires_days: z.number().int().min(0).max(365).optional() }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Name the link (who it is for).')
  const d = b.data
  await requireModule(event, d.kind === 'forecast' ? 'forecast' : 'equity')
  if (!(await shareObject(d.kind, d.object_id))) throw apiError('not_found', 'Not found', 404)
  const exp = (n?: number) => (n ? new Date(Date.now() + n * 86400000).toISOString() : null)
  let id = d.id
  if (d.action === 'create') id = (await one<{ id: string }>('INSERT INTO financials.share_links (kind, object_id, token, label, require_email, notify, expires_at, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
    [d.kind, d.object_id, randomBytes(18).toString('base64url'), d.label ?? 'Shared link', d.require_email ?? true, d.notify ?? true, exp(d.expires_days), user.userId])).id
  else if (!id) throw apiError('invalid', 'Choose a link.')
  else if (d.action === 'delete') await db().query('DELETE FROM financials.share_links WHERE id = $1 AND object_id = $2', [id, d.object_id])
  else await db().query('UPDATE financials.share_links SET label = coalesce($3, label), require_email = coalesce($4, require_email), notify = coalesce($5, notify), active = coalesce($6, active), expires_at = CASE WHEN $7::int IS NULL THEN expires_at WHEN $7::int = 0 THEN NULL ELSE now() + make_interval(days => $7::int) END WHERE id = $1 AND object_id = $2',
    [id, d.object_id, d.label ?? null, d.require_email ?? null, d.notify ?? null, d.active ?? null, d.expires_days ?? null])
  await audit({ event, actorUserId: user.userId, action: 'share.' + d.kind + '_' + d.action, objectType: d.kind, objectId: d.object_id })
  return { ok: true, id }
})
