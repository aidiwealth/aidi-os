// submit (for approval), approve (GPs; two distinct approvals), send (notices to every LP), cancel.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  const b = z.object({ action: z.enum(['submit', 'approve', 'send', 'cancel']) }).safeParse(await readBody(event))
  if (!id.success || !b.success) throw apiError('invalid', 'Invalid action.')
  const c = (await db().query<{ status: string; kind: string; number: number; required_approvals: number; fund_id: string }>('SELECT status, kind, number, required_approvals, fund_id FROM funds.calls WHERE id = $1', [id.data])).rows[0]
  if (!c) throw apiError('not_found', 'Not found', 404)
  const a = b.data.action
  const label = (c.kind === 'call' ? 'Capital call ' : 'Distribution ') + c.number
  if (a === 'submit') {
    if (c.status !== 'draft') throw apiError('state', label + ' is ' + c.status.replace('_', ' ') + '.')
    await db().query("UPDATE funds.calls SET status = 'pending_approval' WHERE id = $1", [id.data])
  } else if (a === 'approve') {
    if (c.status !== 'pending_approval') throw apiError('state', 'Submit it for approval first.')
    await db().query('INSERT INTO funds.call_approvals (call_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [id.data, user.userId])
    const n = (await one<{ n: number }>('SELECT count(*)::int AS n FROM funds.call_approvals WHERE call_id = $1', [id.data])).n
    if (n >= c.required_approvals) await db().query("UPDATE funds.calls SET status = 'approved', approved_at = now() WHERE id = $1", [id.data])
  } else if (a === 'send') {
    if (c.status !== 'approved') throw apiError('state', label + ' needs ' + c.required_approvals + ' GP approval' + (c.required_approvals === 1 ? '' : 's') + ' before it is sent.')
    await db().query("UPDATE funds.calls SET status = 'sent', sent_at = now() WHERE id = $1", [id.data])
    const p = (await fundPosition(c.fund_id))!
    const lines = await db().query<{ lp_id: string; name: string; email: string | null; amount: string }>('SELECT l.lp_id, lp.name, lp.email, l.amount::text FROM funds.call_lines l JOIN funds.lps lp ON lp.id = l.lp_id WHERE l.call_id = $1', [id.data])
    const due = (await one<{ d: string; purpose: string | null }>("SELECT to_char(due_date, 'YYYY-MM-DD') AS d, purpose FROM funds.calls WHERE id = $1", [id.data]))
    let sent = 0
    for (const l of lines.rows) {
      if (!l.email || !p.fund.notify_lps) continue
      try { await sendFundNoticeEmail({ to: l.email, lp: l.name, fund: p.fund.name, kind: c.kind as 'call' | 'distribution', number: c.number, amount: Number(l.amount), currency: p.fund.currency, due: due.d, purpose: due.purpose, admin: adminName(p.fund), adminUrl: p.fund.admin_portal_url, portal: await issueLpLink(l.lp_id) }); sent++ }
      catch (err) { console.error('[funds] notice failed for ' + l.email, err) }
    }
    await audit({ event, actorUserId: user.userId, action: 'funds.' + c.kind + '_sent', objectType: 'fund_call', objectId: id.data, detail: { notices: sent } })
    return { ok: true, notices: sent, lps: lines.rows.length }
  } else {
    if (c.status === 'sent' || c.status === 'completed') throw apiError('state', 'A sent ' + c.kind + ' cannot be cancelled; record the payments instead.')
    await db().query("UPDATE funds.calls SET status = 'cancelled' WHERE id = $1", [id.data])
  }
  await audit({ event, actorUserId: user.userId, action: 'funds.' + c.kind + '_' + a, objectType: 'fund_call', objectId: id.data })
  return { ok: true }
})
