// Use the peers' revenue multiples (25th percentile, median, 75th, after the discounts) as the Exit tab's worst / base
// / best multiples of last-12-month revenue.
import { z } from 'zod'
import { valuate, VAL_DEFAULT, type Peer, type ValAssumptions } from '~/shared/valuation'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp', 'team')
  await requireModule(event, 'equity')
  const b = z.object({ ct: z.string().uuid().optional() }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Choose the cap table.')
  const ct = await capTableId(b.data.ct)
  const v = (await db().query<{ assumptions: Partial<ValAssumptions>; peers: Peer[] }>('SELECT assumptions, peers FROM equity.valuations WHERE captable_id = $1', [ct])).rows[0]
  if (!v) throw apiError('not_found', 'Find peers first.', 404)
  const a = { ...VAL_DEFAULT, ...v.assumptions }
  const val = valuate(await valuationBasis(), v.peers, a), m = val.methods.find((x) => x.key === 'ev_revenue') ?? null
  if (!m) throw apiError('invalid', 'Tick at least two listed peers with an EV / revenue multiple.', 422)
  const k = 1 - val.discount / 100, r1 = (x: number) => Math.round(x * k * 10) / 10
  const mult = { worst: r1(m.low), base: r1(m.mid), best: r1(m.high) }
  await db().query(`INSERT INTO equity.exit_plans (captable_id, assumptions) VALUES ($1, $2::jsonb)
    ON CONFLICT (captable_id) DO UPDATE SET assumptions = equity.exit_plans.assumptions || $2::jsonb, updated_at = now()`,
    [ct, JSON.stringify({ basis: a.basis === 'arr' ? 'arr' : 'revenue_ttm', multiples: mult, rationale: 'From trading peers on the Valuation tab: ' + m.peers + ' listed peers, EV / revenue ' + m.low + '× · ' + m.mid + '× · ' + m.high + '×, less ' + Math.round((1 - k) * 100) + '% for being private and market risk.' })])
  await audit({ event, actorUserId: user.userId, action: 'equity.valuation_to_exit', objectType: 'captable', objectId: ct, detail: mult })
  return { ok: true, multiples: mult }
})
