// LP pipelines (fund raises, debt facilities, co-investments) with totals, and what a new one can be tied to.
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team')
  const pipelines = (await db().query(`SELECT p.id, p.name, p.kind, p.currency, p.target::float AS target, to_char(p.target_close, 'YYYY-MM-DD') AS target_close, p.status, p.fund_id, e.name AS fund, p.deal_id, d.company AS deal,
      coalesce(p.company_id, (SELECT c.id FROM portfolio.companies c WHERE c.deal_id = p.deal_id LIMIT 1)) AS company_id, coalesce(c.name, (SELECT c2.name FROM portfolio.companies c2 WHERE c2.deal_id = p.deal_id LIMIT 1)) AS company,
      (SELECT count(*)::int FROM funds.lp_targets t WHERE t.pipeline_id = p.id) AS lps,
      (SELECT coalesce(sum(t.amount), 0)::float FROM funds.lp_targets t JOIN funds.lp_stages s ON s.id = t.stage_id WHERE t.pipeline_id = p.id AND s.kind IN ('committed', 'won')) AS committed,
      (SELECT coalesce(sum(t.amount), 0)::float FROM funds.lp_targets t JOIN funds.lp_stages s ON s.id = t.stage_id WHERE t.pipeline_id = p.id AND s.kind = 'won') AS closed,
      (SELECT coalesce(sum(t.amount), 0)::float FROM funds.lp_targets t JOIN funds.lp_stages s ON s.id = t.stage_id WHERE t.pipeline_id = p.id AND s.kind <> 'lost') AS in_play
    FROM funds.lp_pipelines p LEFT JOIN funds.funds f ON f.id = p.fund_id LEFT JOIN core.entities e ON e.id = f.entity_id LEFT JOIN deals.deals d ON d.id = p.deal_id LEFT JOIN portfolio.companies c ON c.id = p.company_id
    ORDER BY p.status, p.created_at DESC`)).rows
  const funds = (await db().query("SELECT f.id, e.name, f.currency, f.target_size::float AS target, f.status FROM funds.funds f JOIN core.entities e ON e.id = f.entity_id ORDER BY e.name")).rows
  const deals = (await db().query("SELECT id, company, round, stage FROM deals.deals WHERE closed_at IS NULL OR stage NOT IN ('passed', 'lost', 'declined') ORDER BY created_at DESC LIMIT 200").catch(() => ({ rows: [] }))).rows
  const companies = (await db().query("SELECT id, name, deal_id FROM portfolio.companies WHERE active ORDER BY name LIMIT 300").catch(() => ({ rows: [] }))).rows
  return { pipelines, funds, deals, companies, kinds: PIPELINE_KIND }
})
