import { allowedFor } from '~/shared/risk'
// One secondary with the wealth clients interested in it, the investments recorded against it, and what's needed to
// record an investment or add it to the portfolio.
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin', 'gp', 'team')
  const id = getRouterParam(event, 'id')
  const s = (await db().query<{ company: string | null; portfolio_company_id: string | null }>('SELECT company, portfolio_company_id FROM wm.secondaries WHERE id = $1', [id])).rows[0]
  if (!s) throw apiError('not_found', 'Not found', 404)
  const interest = (await db().query("SELECT i.id, i.client_id, c.name AS client, c.risk_profile, i.amount::float, i.note, i.status, i.created_at FROM wm.secondary_interest i JOIN wm.clients c ON c.id = i.client_id WHERE i.secondary_id = $1 ORDER BY i.created_at", [id])).rows
  const investments = (await db().query("SELECT h.id, h.cost::float AS amount, h.current_value::float AS value, h.currency, coalesce(h.meta->>'invested_on', to_char(h.as_of, 'YYYY-MM-DD')) AS date, coalesce(c.name, e.name, 'The group') AS investor, h.wm_client_id FROM wealth.holdings h LEFT JOIN wm.clients c ON c.id = h.wm_client_id LEFT JOIN core.entities e ON e.id = h.entity_id WHERE h.meta->>'secondary_id' = $1::text ORDER BY h.as_of", [id])).rows
  const cfg = await riskConfig(), rating = cfg.ratings.secondaries ?? 5
  for (const i of interest as { risk_profile: string | null; above_risk?: boolean }[]) i.above_risk = !allowedFor(i.risk_profile, rating, cfg)
  const clients = (await db().query("SELECT id, name, risk_profile FROM wm.clients WHERE status <> 'closed' ORDER BY name LIMIT 500").catch(() => ({ rows: [] }))).rows
  const entities = (await db().query("SELECT id, name, kind FROM core.entities WHERE status <> 'dissolved' ORDER BY (kind IN ('fund','spv')) DESC, name").catch(() => ({ rows: [] }))).rows
  const portfolio = s.portfolio_company_id ? (await db().query('SELECT c.id, c.name, e.name AS held_by FROM portfolio.companies c LEFT JOIN core.entities e ON e.id = c.holding_entity_id WHERE c.id = $1', [s.portfolio_company_id]).catch(() => ({ rows: [] }))).rows[0] ?? null : null
  const matches = !portfolio && s.company ? (await db().query('SELECT c.id, c.name, e.name AS held_by FROM portfolio.companies c LEFT JOIN core.entities e ON e.id = c.holding_entity_id WHERE lower(c.name) = lower($1) LIMIT 3', [s.company]).catch(() => ({ rows: [] }))).rows : []
  for (const c of clients as { risk_profile: string | null; above_risk?: boolean }[]) c.above_risk = !allowedFor(c.risk_profile, rating, cfg)
  return { rating, interest, investments, clients, entities, portfolio, matches }
})
