export interface DocumentRow {
  id: string; title: string; kind: string; sensitivity: string; mime_type: string; size_bytes: string
  created_at: string; entity_name: string | null; uploaded_by: string | null
}
export default defineEventHandler(async (event): Promise<DocumentRow[]> => {
  const user = await requireRole(event, 'gp', 'team', 'family')
  const levels = visibleLevels(user.roles)
  // Someone limited to some companies sees that library's documents for those companies (and what they uploaded),
  // not group-wide ones; everyone sees only the sensitivity levels their role allows.
  const scope = String(event.context.entityScope ?? '')
  const r = await db().query<DocumentRow>(
    `SELECT d.id, d.title, d.kind, d.sensitivity, d.mime_type, d.size_bytes::text, d.created_at, e.name AS entity_name, u.email AS uploaded_by
       FROM core.documents d LEFT JOIN core.entities e ON e.id = d.entity_id LEFT JOIN core.users u ON u.id = d.uploaded_by
      WHERE d.sensitivity = ANY($1::text[]) AND d.area = 'org'
        AND ($2 = '' OR d.uploaded_by = $3::uuid OR d.entity_id::text = ANY(string_to_array($2, ',')))
      ORDER BY d.created_at DESC LIMIT 1000`, [levels, scope, user.userId])
  return r.rows
})
