export interface PortfolioRow {
  id: string; name: string; founder_name: string; founder_email: string; latest_period: string | null
  revenue: string | null; cash: string | null; net_burn: string | null; last_request_status: string | null; last_request_period: string | null
}
export default defineEventHandler(async (event): Promise<PortfolioRow[]> => {
  await requireRole(event, 'gp', 'team')
  const r = await db().query<PortfolioRow>(
    `SELECT c.id, c.name, c.founder_name, c.founder_email,
            to_char(lp.period, 'YYYY-MM-DD') AS latest_period,
            (SELECT coalesce(override_value, founder_value)::text FROM portfolio.metric_values WHERE company_id = c.id AND period = lp.period AND metric = 'revenue') AS revenue,
            (SELECT coalesce(override_value, founder_value)::text FROM portfolio.metric_values WHERE company_id = c.id AND period = lp.period AND metric = 'cash') AS cash,
            (SELECT coalesce(override_value, founder_value)::text FROM portfolio.metric_values WHERE company_id = c.id AND period = lp.period AND metric = 'net_burn') AS net_burn,
            lr.status AS last_request_status, to_char(lr.period, 'YYYY-MM-DD') AS last_request_period
       FROM portfolio.companies c
       LEFT JOIN LATERAL (SELECT max(period) AS period FROM portfolio.metric_values WHERE company_id = c.id AND coalesce(override_value, founder_value) IS NOT NULL) lp ON true
       LEFT JOIN LATERAL (SELECT status, period FROM portfolio.requests WHERE company_id = c.id ORDER BY sent_at DESC LIMIT 1) lr ON true
      WHERE c.active ORDER BY c.name`)
  return r.rows
})
