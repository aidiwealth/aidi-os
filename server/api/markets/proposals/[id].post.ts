// Approve (with a fresh code) or reject a proposed trade, or cancel a ticket not placed. An approved trade becomes a
// ticket to place at the broker; orders sent to Alpaca by API come in the next step. Client accounts cannot be
// approved until the compliance switches are on.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireMarkets(event)
  const id = String(getRouterParam(event, 'id'))
  const b = z.object({ action: z.enum(['approve', 'reject', 'cancel']), code: z.string().max(20).optional(), note: z.string().max(500).optional() }).safeParse(await readBody(event))
  if (!b.success || !/^[0-9a-f-]{36}$/.test(id)) throw apiError('invalid', 'Say what to do.')
  const p = (await db().query<{ id: string; status: string; expires_at: string; account_id: string; symbol: string; side: string; qty: string; notional: string; checks: { name: string; ok: boolean; detail: string }[] }>('SELECT id, status, expires_at, account_id, symbol, side, qty::text, notional::text, checks FROM markets.proposals WHERE id = $1', [id])).rows[0]
  if (!p) throw apiError('not_found', 'Proposal not found.', 404)
  const a = await marketAccount(p.account_id)
  if (b.data.action === 'approve') {
    if (p.status !== 'waiting') throw apiError('invalid', 'This proposal is ' + p.status + '.', 409)
    if (Date.parse(p.expires_at) < Date.now()) throw apiError('expired', 'This proposal has expired. Ask for new proposals.', 409)
    if (a.owner_type === 'client') throw apiError('compliance', 'Client trades cannot be approved until the compliance switches are on.', 409)
    const failed = (p.checks ?? []).filter((c) => !c.ok)
    if (failed.length) throw apiError('checks_failed', 'It does not pass every check: ' + failed.map((c) => c.name + ' (' + c.detail + ')').join(', ') + '.', 409)
    await checkFreshCode(user.userId, b.data.code ?? '')
    const r = await db().query("UPDATE markets.proposals SET status = 'ticket', decided_by = $2, decided_at = now(), decision_note = $3 WHERE id = $1 AND status = 'waiting'", [id, user.userId, b.data.note ?? null])
    if (!r.rowCount) throw apiError('invalid', 'Someone else just decided this proposal.', 409)
  } else {
    const from = b.data.action === 'reject' ? 'waiting' : 'ticket'
    const r = await db().query("UPDATE markets.proposals SET status = $3, decided_by = $2, decided_at = now(), decision_note = $4 WHERE id = $1 AND status = $5", [id, user.userId, b.data.action === 'reject' ? 'rejected' : 'cancelled', b.data.note ?? null, from])
    if (!r.rowCount) throw apiError('invalid', 'This proposal cannot be ' + (b.data.action === 'reject' ? 'rejected' : 'cancelled') + ' now.', 409)
  }
  await audit({ event, actorUserId: user.userId, action: 'markets.proposal_' + b.data.action, objectType: 'markets.proposal', objectId: id, entityId: a.entity_id ?? undefined, detail: { account: a.name, symbol: p.symbol, side: p.side, qty: Number(p.qty), notional: Number(p.notional), note: b.data.note ?? null } })
  return { ok: true }
})
