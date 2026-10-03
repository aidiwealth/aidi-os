// Overview: entities with their parties and resolutions, and what is waiting for my signature.
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'family', 'gp')
  const ents = await db().query(
    `SELECT e.id, e.name, e.kind, e.status,
            (SELECT count(*)::int FROM governance.parties p WHERE p.entity_id = e.id AND (p.end_date IS NULL OR p.end_date >= current_date)) AS parties,
            (SELECT count(*)::int FROM governance.resolutions r WHERE r.entity_id = e.id) AS resolutions,
            (SELECT count(*)::int FROM governance.resolutions r WHERE r.entity_id = e.id AND r.status = 'circulating') AS open
       FROM core.entities e ORDER BY (e.kind = 'trust') DESC, e.name`)
  const mine = await db().query(
    `SELECT r.id, r.title, r.kind, e.name AS entity, r.circulated_at
       FROM governance.resolutions r JOIN core.entities e ON e.id = r.entity_id
      WHERE r.status = 'circulating'
        AND EXISTS (SELECT 1 FROM governance.parties p WHERE p.entity_id = r.entity_id AND p.email = $1 AND p.role = ANY($2::text[]) AND (p.end_date IS NULL OR p.end_date >= current_date))
        AND NOT EXISTS (SELECT 1 FROM governance.approvals a WHERE a.resolution_id = r.id AND a.user_id = $3)
      ORDER BY r.circulated_at`, [user.email, [...SIGNING_ROLES], user.userId])
  return { entities: ents.rows, awaiting: mine.rows }
})
