// Add or change a brokerage account (admins and GPs): who owns it, the broker, how trades are placed, the risk level
// and target mix. Company accounts post journals; retirement plans and client accounts do not.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireMarkets(event)
  const pct = z.number().min(0).max(100)
  const b = z.object({ id: z.string().uuid().optional(), name: z.string().trim().min(1).max(120), broker: z.enum(['alpaca', 'robinhood', 'schwab', 'fidelity', 'vanguard', 'other']), broker_label: z.string().trim().max(80).optional().nullable(),
    kind: z.enum(['taxable', 'retirement']), owner_type: z.enum(['entity', 'client', 'plan']), entity_id: z.string().uuid().optional().nullable(), wm_client_id: z.string().uuid().optional().nullable(),
    execution: z.enum(['manual', 'alpaca']), external_id: z.string().trim().max(80).optional().nullable(), risk_level: z.enum(Object.keys(RISK_LIMITS_ALL()) as [string, ...string[]]),
    model: z.object({ stocks: pct, etf: pct, crypto: pct, cash: pct }), daily_limit: z.number().min(0).max(10_000_000), close: z.boolean().optional() }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Check the account details: ' + (b.error.issues[0]?.path.join('.') ?? ''))
  const d = b.data
  if (Math.round(d.model.stocks + d.model.etf + d.model.crypto + d.model.cash) !== 100) throw apiError('invalid', 'The target mix must add up to 100%.')
  if (d.execution === 'alpaca' && d.broker !== 'alpaca') throw apiError('invalid', 'Orders by API are only for Alpaca accounts.')
  if (d.owner_type === 'entity' && !(d.entity_id && (await db().query('SELECT 1 FROM core.entities WHERE id = $1', [d.entity_id])).rowCount)) throw apiError('invalid', 'Choose the company that owns the account.')
  if (d.owner_type === 'client' && !(d.wm_client_id && (await db().query('SELECT 1 FROM wm.clients WHERE id = $1', [d.wm_client_id])).rowCount)) throw apiError('invalid', 'Choose the client.')
  const vals = [d.name, d.broker, d.broker_label || null, d.kind, d.owner_type, d.owner_type === 'entity' ? d.entity_id : null, d.owner_type === 'client' ? d.wm_client_id : null, d.execution, d.external_id || null, d.risk_level, JSON.stringify(d.model), d.daily_limit, d.owner_type === 'entity']
  let id = d.id
  if (id) {
    const r = await db().query("UPDATE markets.accounts SET name=$2, broker=$3, broker_label=$4, kind=$5, owner_type=$6, entity_id=$7, wm_client_id=$8, execution=$9, external_id=$10, risk_level=$11, model=$12, daily_limit=$13, post_journals=$14, status = $15 WHERE id = $1", [id, ...vals, d.close ? 'closed' : 'active'])
    if (!r.rowCount) throw apiError('not_found', 'Account not found.', 404)
  } else id = (await db().query<{ id: string }>('INSERT INTO markets.accounts (name, broker, broker_label, kind, owner_type, entity_id, wm_client_id, execution, external_id, risk_level, model, daily_limit, post_journals, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id', [...vals, user.userId])).rows[0]!.id
  await audit({ event, actorUserId: user.userId, action: d.id ? (d.close ? 'markets.account_closed' : 'markets.account_changed') : 'markets.account_added', objectType: 'markets.account', objectId: id, entityId: d.owner_type === 'entity' ? d.entity_id ?? undefined : undefined, detail: { ...d } })
  return { id }
})
