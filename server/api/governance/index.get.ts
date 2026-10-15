// Overview: entities with their parties and resolutions, and what is waiting for my signature.
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'family', 'gp')
  // Each entity with its register in a few words (who signs, how many beneficiaries) and its papers.
  const ents = await db().query(
    `SELECT e.id, e.name, e.kind, e.status, e.jurisdiction, pe.name AS parent,
            (SELECT count(*)::int FROM governance.parties p WHERE p.entity_id = e.id AND (p.end_date IS NULL OR p.end_date >= current_date)) AS parties,
            coalesce((SELECT json_agg(json_build_object('name', p.name, 'role', p.role) ORDER BY array_position(ARRAY['settlor','trustee','protector','director','officer','member','signatory','successor_trustee'], p.role), p.name)
                        FROM governance.parties p WHERE p.entity_id = e.id AND p.role = ANY($1::text[]) AND (p.end_date IS NULL OR p.end_date >= current_date)), '[]') AS signers,
            (SELECT count(*)::int FROM governance.parties p WHERE p.entity_id = e.id AND p.role = 'beneficiary' AND (p.end_date IS NULL OR p.end_date >= current_date)) AS beneficiaries,
            (SELECT count(*)::int FROM governance.resolutions r WHERE r.entity_id = e.id) AS resolutions,
            (SELECT count(*)::int FROM governance.resolutions r WHERE r.entity_id = e.id AND r.status = 'circulating') AS open,
            (SELECT to_char(max(r.created_at), 'YYYY-MM-DD') FROM governance.resolutions r WHERE r.entity_id = e.id) AS last_paper
       FROM core.entities e LEFT JOIN core.entities pe ON pe.id = e.parent_id
      ORDER BY (e.kind = 'trust') DESC, e.name`, [[...SIGNING_ROLES, 'settlor']])
  const mine = await db().query(
    `SELECT r.id, r.title, r.kind, e.name AS entity, r.circulated_at
       FROM governance.resolutions r JOIN core.entities e ON e.id = r.entity_id
      WHERE r.status = 'circulating'
        AND EXISTS (SELECT 1 FROM governance.parties p WHERE p.entity_id = r.entity_id AND p.email = $1 AND p.role = ANY($2::text[]) AND (p.end_date IS NULL OR p.end_date >= current_date))
        AND NOT EXISTS (SELECT 1 FROM governance.approvals a WHERE a.resolution_id = r.id AND a.user_id = $3)
      ORDER BY r.circulated_at`, [user.email, [...SIGNING_ROLES], user.userId])
  return { entities: ents.rows, awaiting: mine.rows }
})
