import { allowedFor } from '~/shared/risk'
import { expireSecondaries } from '~/server/utils/secondaries'
// Wealth client portal: the deals the team is showing clients (open and marked visible), and this client's interest.
// No sources, links or vendor names: just the deal.
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'wealth_client', 'admin')
  const q = String(getQuery(event).client ?? '')
  const client = user.roles.includes('admin') && /^[0-9a-f-]{36}$/.test(q) ? q : await wmClientOfUser(user.userId)
  if (!client) throw apiError('not_found', 'Your wealth account is not set up yet.', 404)
  if (!(await enabledModules()).has('secondaries')) return { deals: [] }
  await expireSecondaries()
  const lvl = (await db().query<{ r: string | null }>('SELECT risk_profile AS r FROM wm.clients WHERE id = $1', [client])).rows[0]?.r ?? null
  const cfg = await riskConfig(), rating = cfg.ratings.secondaries ?? 5
  if (!allowedFor(lvl, rating, cfg)) return { deals: [], risk: { level: lvl, rating, allowed: false } }
  const deals = (await db().query(`SELECT s.id, coalesce(s.company, '') AS company, s.website, s.logo_doc_id, s.company_info->>'description' AS about, s.title, s.sector, s.stage, s.lead, s.co_investors, s.min_investment::float, s.valuation, s.currency, to_char(s.received_at, 'YYYY-MM-DD') AS received, to_char(s.closes_at, 'YYYY-MM-DD') AS closes_at, s.status = 'expired' AS closed,
      i.status AS my_status, i.amount::float AS my_amount
    FROM wm.secondaries s LEFT JOIN wm.secondary_interest i ON i.secondary_id = s.id AND i.client_id = $1
    WHERE s.client_visible AND (s.status IN ('new','reviewing','interested') OR i.id IS NOT NULL) AND s.fits IS NOT FALSE
    ORDER BY s.received_at DESC LIMIT 60`, [client])).rows
  return { deals, risk: { level: lvl, rating, allowed: true } }
})
