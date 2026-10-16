import { allowedFor } from '~/shared/risk'
// Record an investment in a secondary: by the group, by one of our entities (e.g. Aidi Angel Fund) or for a wealth
// client. It becomes a holding in the Secondaries asset class (net worth, AUM, statements; a fund's holdings show
// under Venture), linked back to the deal; the deal is marked invested. A current value can be given for older deals.
import { z } from 'zod'
const num = (min: number) => z.preprocess((v) => (typeof v === 'string' ? (v.replace(/[,\s$]/g, '') || null) : v), z.coerce.number().min(min).nullable())
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp', 'team')
  const id = getRouterParam(event, 'id')
  const b = z.object({ client_id: z.string().uuid().nullable().optional(), entity_id: z.string().uuid().nullable().optional(), amount: num(0.01), value: num(0).optional(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), currency: z.string().regex(/^[A-Z]{3}$/).default('USD') }).safeParse(await readBody(event))
  if (!b.success || !b.data.amount) throw apiError('invalid', 'Enter the amount and date.')
  const d = b.data
  const s = (await db().query<{ title: string; company: string | null; sector: string | null; stage: string | null; source: string }>('SELECT title, company, sector, stage, source FROM wm.secondaries WHERE id = $1', [id])).rows[0]
  if (!s) throw apiError('not_found', 'Not found', 404)
  if (d.client_id && !(await db().query('SELECT 1 FROM wm.clients WHERE id = $1', [d.client_id])).rowCount) throw apiError('invalid', 'Choose a client.')
  if (d.entity_id && !(await db().query('SELECT 1 FROM core.entities WHERE id = $1', [d.entity_id])).rowCount) throw apiError('invalid', 'Choose an entity.')
  const value = d.value ?? d.amount
  const h = await one<{ id: string }>(`INSERT INTO wealth.holdings (section, category, name, platform, currency, cost, current_value, as_of, status, notes, meta, wm_client_id, entity_id, created_by)
    VALUES ($1, 'secondaries', $2, 'Secondaries', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
    [d.client_id ? 'client' : d.entity_id ? 'venture' : 'wealth', (s.company || s.title).slice(0, 200), d.currency, d.amount, value, d.value != null ? new Date().toISOString().slice(0, 10) : d.date, value === d.amount ? 'at_cost' : 'active',
      [s.sector, s.stage].filter(Boolean).join(' · ') || null, JSON.stringify({ secondary_id: id, invested_on: d.date }), d.client_id ?? null, d.client_id ? null : d.entity_id ?? null, user.userId])
  if (d.client_id) await db().query("INSERT INTO wm.secondary_interest (secondary_id, client_id, amount, status, holding_id) VALUES ($1,$2,$3,'invested',$4) ON CONFLICT (secondary_id, client_id) DO UPDATE SET amount = EXCLUDED.amount, status = 'invested', holding_id = EXCLUDED.holding_id, updated_at = now()", [id, d.client_id, d.amount, h.id])
  await db().query("UPDATE wm.secondaries SET status = 'invested', amount = (SELECT sum(cost) FROM wealth.holdings WHERE meta->>'secondary_id' = $1::text AND status NOT IN ('sold','written_off')), updated_at = now() WHERE id = $1", [id])
  await audit({ event, actorUserId: user.userId, action: 'secondaries.invest', objectType: 'holding', objectId: h.id, detail: { secondary: id, client: d.client_id ?? null, entity: d.entity_id ?? null, amount: d.amount } })
  let warning: string | null = null
  if (d.client_id) { const cfg = await riskConfig(); const lvl = (await db().query<{ r: string | null }>('SELECT risk_profile AS r FROM wm.clients WHERE id = $1', [d.client_id])).rows[0]?.r ?? null; if (!allowedFor(lvl, cfg.ratings.secondaries ?? 5, cfg)) warning = lvl ? 'This is above the client\'s risk level (' + lvl.replace('_', ' ') + ').' : 'The client has not set a risk level yet.' }
  return { ok: true, holding_id: h.id, warning }
})
