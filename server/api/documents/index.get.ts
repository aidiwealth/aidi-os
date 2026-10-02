export interface DocumentRow {
  id: string; title: string; kind: string; sensitivity: string; mime_type: string; size_bytes: string
  created_at: string; entity_name: string | null; uploaded_by: string | null
}
export default defineEventHandler(async (event): Promise<DocumentRow[]> => {
  const user = await requireRole(event, 'gp', 'team', 'family')
  const levels = visibleLevels(user.roles)
  const r = await db().query<DocumentRow>(
    `SELECT d.id, d.title, d.kind, d.sensitivity, d.mime_type, d.size_bytes::text, d.created_at, e.name AS entity_name, u.email AS uploaded_by
       FROM core.documents d LEFT JOIN core.entities e ON e.id = d.entity_id LEFT JOIN core.users u ON u.id = d.uploaded_by
      WHERE d.sensitivity = ANY($1::text[]) ORDER BY d.created_at DESC LIMIT 1000`, [levels])
  return r.rows
})
