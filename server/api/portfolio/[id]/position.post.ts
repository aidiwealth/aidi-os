// Position actions: choose which holdings are this company; record a round the team knows about; or mark the holdings
// to what the latest round implies (Investments & AUM is updated, with a note of where the value came from).
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  const n = z.coerce.number().min(0).max(1e15).nullable().optional()
  const b = z.object({ holdings: z.array(z.string().uuid()).max(20).optional(),
    round: z.object({ period: z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/), kind: z.enum(['priced', 'safe', 'note', 'other']), round_name: z.string().max(80).optional(), amount: n, price_per_share: n, valuation_cap: n, post_money: n, fd_shares: n, our_shares: n }).optional(),
    mark: z.boolean().optional() }).safeParse(await readBody(event))
  if (!id.success || !b.success) throw apiError('invalid', 'Check the figures.')
  if (!(await db().query('SELECT 1 FROM portfolio.companies WHERE id = $1', [id.data])).rowCount) throw apiError('not_found', 'Not found', 404)
  if (b.data.holdings) await db().query('UPDATE portfolio.companies SET holding_ids = $2 WHERE id = $1', [id.data, b.data.holdings])
  if (b.data.round) {
    const r = b.data.round, period = r.period.length === 7 ? r.period + '-01' : r.period
    await db().query(`INSERT INTO portfolio.cap_updates (company_id, period, source, new_money, kind, round_name, amount, price_per_share, valuation_cap, post_money, fd_shares, our_shares) VALUES ($1,$2,'team',true,$3,$4,$5,$6,$7,$8,$9,$10)
      ON CONFLICT (company_id, period, source) DO UPDATE SET kind = EXCLUDED.kind, round_name = EXCLUDED.round_name, amount = EXCLUDED.amount, price_per_share = EXCLUDED.price_per_share, valuation_cap = EXCLUDED.valuation_cap, post_money = EXCLUDED.post_money, fd_shares = EXCLUDED.fd_shares, our_shares = EXCLUDED.our_shares, created_at = now()`,
      [id.data, period, r.kind, r.round_name || null, r.amount ?? null, r.price_per_share ?? null, r.valuation_cap ?? null, r.post_money ?? null, r.fd_shares ?? null, r.our_shares ?? null])
  }
  let marked = 0
  if (b.data.mark) {
    const p = await positionOf(id.data)
    for (const l of p.lines) {
      if (l.implied === null) continue
      await db().query("UPDATE wealth.holdings SET current_value = $2, as_of = current_date, meta = meta || jsonb_build_object('marked_from', $3::text, 'marked_at', now()::text), updated_at = now() WHERE id = $1", [l.holding.id, Math.round(l.implied * 100) / 100, (p.latest?.label ?? 'latest round') + ': ' + l.how])
      marked++
    }
  }
  await audit({ event, actorUserId: user.userId, action: 'portfolio.position_updated', objectType: 'company', objectId: id.data, detail: { holdings: b.data.holdings?.length, round: !!b.data.round, marked } })
  return { ok: true, marked }
})
