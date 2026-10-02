// Group entities with what is tagged to each: deals (as vehicle), portfolio companies (as holder) and documents.
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'team', 'family')
  const levels = visibleLevels(user.roles)
  const r = await db().query(
    `SELECT e.id, e.name, e.legal_name, e.kind, e.jurisdiction, e.status, e.parent_id, pe.name AS parent_name,
            (SELECT count(*)::int FROM deals.deals d WHERE d.vehicle_entity_id = e.id AND d.stage NOT IN ('passed')) AS deals,
            (SELECT count(*)::int FROM portfolio.companies c WHERE c.holding_entity_id = e.id AND c.active) AS companies,
            (SELECT count(*)::int FROM core.documents doc WHERE doc.entity_id = e.id AND doc.sensitivity = ANY($1::text[])) AS documents
       FROM core.entities e LEFT JOIN core.entities pe ON pe.id = e.parent_id ORDER BY e.kind, e.name`, [levels])
  return r.rows
})
