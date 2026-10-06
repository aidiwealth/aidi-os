// Create, edit or share a board.
import { randomBytes } from 'node:crypto'
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp')
  const metric = z.string().refine((m) => m in BOARD_METRICS, 'Unknown metric')
  const b = z.object({ id: z.string().uuid().optional(), name: z.string().trim().min(1).max(80).optional(), note: z.string().max(1000).optional(), kpis: z.array(metric).max(12).optional(),
    charts: z.array(z.object({ title: z.string().trim().min(1).max(80), metrics: z.array(metric).min(1).max(3), type: z.enum(['line', 'bar', 'area', 'pie', 'table']).default('line') })).max(10).optional(), period: z.enum(['month', 'quarter', 'year']).optional(), count: z.number().int().min(2).max(36).optional(),
    share: z.object({ enabled: z.boolean(), expires_days: z.number().int().min(0).max(365).default(0), reset: z.boolean().default(false) }).optional() }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Check the board settings.')
  const d = b.data
  let id = d.id
  if (!id) id = (await one<{ id: string }>("INSERT INTO financials.boards (audience, name, sort, kpis, charts, note, created_by) VALUES ('custom', $1, 99, $2, $3, $4, $5) RETURNING id", [d.name ?? 'New board', d.kpis ?? ['revenue', 'cash', 'runway'], JSON.stringify(d.charts ?? [{ title: 'Revenue', metrics: ['revenue'] }]), d.note ?? null, user.userId])).id
  else {
    const sets: string[] = []; const args: unknown[] = [id]
    const add = (col: string, v: unknown) => { args.push(v); sets.push(col + ' = $' + args.length) }
    if (d.name !== undefined) add('name', d.name); if (d.note !== undefined) add('note', d.note || null); if (d.kpis) add('kpis', d.kpis); if (d.charts) add('charts', JSON.stringify(d.charts)); if (d.period) add('period', d.period); if (d.count) add('count', d.count)
    if (sets.length) { const r = await db().query('UPDATE financials.boards SET ' + sets.join(', ') + ', updated_at = now() WHERE id = $1', args); if (!r.rowCount) throw apiError('not_found', 'Not found', 404) }
  }
  if (d.share) {
    const cur = (await db().query<{ share_token: string | null }>('SELECT share_token FROM financials.boards WHERE id = $1', [id])).rows[0]
    const token = !cur?.share_token || d.share.reset ? randomBytes(18).toString('base64url') : cur.share_token
    await db().query('UPDATE financials.boards SET share_token = $2, share_enabled = $3, share_expires = CASE WHEN $4::int > 0 THEN now() + make_interval(days => $4::int) ELSE NULL END WHERE id = $1', [id, token, d.share.enabled, d.share.expires_days])
    await audit({ event, actorUserId: user.userId, action: 'board.share_' + (d.share.enabled ? 'on' : 'off'), objectType: 'board', objectId: id })
  }
  return { ok: true, id }
})
