// One LP pipeline: what it is tied to, its stages with totals, and each LP in it.
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team')
  const id = String(getRouterParam(event, 'id') ?? '')
  if (!/^[0-9a-f-]{36}$/.test(id)) throw apiError('not_found', 'Not found', 404)
  const p = (await db().query(`SELECT p.id, p.name, p.kind, p.currency, p.target::float AS target, to_char(p.target_close, 'YYYY-MM-DD') AS target_close, p.status, p.notes, p.mandate, p.interest_pct::float AS interest_pct, p.tenor_months,
      p.fund_id, e.name AS fund, f.target_size::float AS fund_size, p.deal_id, d.company AS deal, d.round AS deal_round, d.pitch_id,
      coalesce(p.company_id, (SELECT c.id FROM portfolio.companies c WHERE c.deal_id = p.deal_id LIMIT 1)) AS company_id, coalesce(c.name, (SELECT c2.name FROM portfolio.companies c2 WHERE c2.deal_id = p.deal_id LIMIT 1)) AS company
    FROM funds.lp_pipelines p LEFT JOIN funds.funds f ON f.id = p.fund_id LEFT JOIN core.entities e ON e.id = f.entity_id LEFT JOIN deals.deals d ON d.id = p.deal_id LEFT JOIN portfolio.companies c ON c.id = p.company_id WHERE p.id = $1`, [id])).rows[0]
  if (!p) throw apiError('not_found', 'Pipeline not found.', 404)
  const stages = (await db().query(`SELECT s.id, s.name, s.kind, s.sort, (SELECT count(*)::int FROM funds.lp_targets t WHERE t.stage_id = s.id) AS n, (SELECT coalesce(sum(t.amount), 0)::float FROM funds.lp_targets t WHERE t.stage_id = s.id) AS total
    FROM funds.lp_stages s WHERE s.pipeline_id = $1 ORDER BY s.sort`, [id])).rows
  const targets = (await db().query(`SELECT t.id, t.stage_id, t.amount::float AS amount, t.likelihood, t.likelihood_note, t.next_step, to_char(t.next_date, 'YYYY-MM-DD') AS next_date, t.notes, t.lp_id, t.commitment_id, to_char(t.updated_at, 'YYYY-MM-DD') AS updated,
      x.id AS prospect_id, x.name, x.kind, x.capital, x.country, x.contact_name, x.contact_title, x.email, x.linkedin, x.website, x.ticket_min_usd::float AS ticket_min_usd, x.ticket_max_usd::float AS ticket_max_usd, x.mandate, x.backs_emerging
    FROM funds.lp_targets t JOIN funds.lp_prospects x ON x.id = t.prospect_id WHERE t.pipeline_id = $1 ORDER BY t.updated_at DESC`, [id])).rows
  return { pipeline: p, stages, targets }
})
