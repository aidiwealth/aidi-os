// Fundraising pipelines with committed and closed totals.
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team')
  return (await db().query(`SELECT p.id, p.name, p.currency, p.target::float, p.instrument, p.valuation_cap::float, p.status,
      coalesce((SELECT sum(d.amount) FROM crm.deals d JOIN crm.stages s ON s.id = d.stage_id WHERE d.pipeline_id = p.id AND s.kind IN ('committed','won')), 0)::float AS committed,
      coalesce((SELECT sum(d.amount) FROM crm.deals d JOIN crm.stages s ON s.id = d.stage_id WHERE d.pipeline_id = p.id AND s.kind = 'won'), 0)::float AS closed,
      (SELECT count(*)::int FROM crm.deals d JOIN crm.stages s ON s.id = d.stage_id WHERE d.pipeline_id = p.id AND s.kind <> 'lost') AS investors
    FROM crm.pipelines p ORDER BY (p.status = 'open') DESC, p.created_at DESC`)).rows
})
