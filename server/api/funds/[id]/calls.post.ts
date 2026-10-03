// Draft a capital call (split by commitment) or a distribution (split by paid-in capital).
import { z } from 'zod'
const Body = z.object({ kind: z.enum(['call', 'distribution']), total_amount: z.coerce.number().positive().max(1e13), due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), purpose: z.string().trim().max(1000).optional() })
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  const b = Body.safeParse(await readBody(event))
  if (!id.success || !b.success) throw apiError('invalid', 'Add the amount and the date.')
  const p = await fundPosition(id.data)
  if (!p) throw apiError('not_found', 'Fund not found', 404)
  const d = b.data
  let weights: { id: string; w: number }[]
  if (d.kind === 'call') {
    if (d.total_amount > p.totals.unfunded + 0.005) throw apiError('invalid', 'That is more than the uncalled commitments (' + p.totals.unfunded.toLocaleString() + ').')
    if (!p.lps.length) throw apiError('invalid', 'Add LP commitments first.')
    weights = p.lps.map((l) => ({ id: l.lp_id, w: l.commitment }))
  } else {
    weights = p.lps.filter((l) => l.paidIn > 0).map((l) => ({ id: l.lp_id, w: l.paidIn }))
    if (!weights.length) throw apiError('invalid', 'No LP has paid in capital yet, so there is nothing to distribute pro rata.')
  }
  const alloc = allocate(d.total_amount, weights)
  const client = await db().connect()
  try {
    await client.query('BEGIN')
    const n = await client.query<{ n: number }>('SELECT coalesce(max(number), 0)::int + 1 AS n FROM funds.calls WHERE fund_id = $1 AND kind = $2', [id.data, d.kind])
    const c = await client.query<{ id: string }>('INSERT INTO funds.calls (fund_id, kind, number, purpose, total_amount, due_date, required_approvals, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
      [id.data, d.kind, n.rows[0]!.n, d.purpose || null, d.total_amount, d.due_date, await requiredApprovals(), user.userId])
    for (const [lp, amt] of alloc) await client.query('INSERT INTO funds.call_lines (call_id, lp_id, amount) VALUES ($1,$2,$3)', [c.rows[0]!.id, lp, amt])
    await client.query('COMMIT')
    await audit({ event, actorUserId: user.userId, action: 'funds.' + d.kind + '_draft', objectType: 'fund_call', objectId: c.rows[0]!.id, detail: { amount: d.total_amount } })
    return { ok: true, id: c.rows[0]!.id }
  } catch (err) { await client.query('ROLLBACK'); throw err } finally { client.release() }
})
