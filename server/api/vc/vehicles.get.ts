// The workspace's fund vehicles (funds and SPVs) with how much uses each.
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team', 'family')
  const r = await db().query(
    `SELECT e.id, e.name, e.kind, e.status, (SELECT count(*)::int FROM deals.deals d WHERE d.vehicle_entity_id = e.id) AS deals,
            (SELECT count(*)::int FROM portfolio.companies c WHERE c.holding_entity_id = e.id) AS companies, EXISTS (SELECT 1 FROM funds.funds f WHERE f.entity_id = e.id) AS fund_setup
       FROM core.entities e WHERE e.kind IN ('fund','spv') ORDER BY e.status = 'active' DESC, e.name`)
  return r.rows
})
