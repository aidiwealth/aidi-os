// Documents attached to holders on a cap table (for the Shareholders and SAFEs lists).
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin', 'gp', 'team')
  const ct = await capTableId(getQuery(event).ct)
  return (await db().query(`SELECT x.id, x.holder_id, x.convertible_id, x.issuance_id, x.document_id, x.kind, x.round, (x.room_file_id IS NOT NULL) AS in_room, d.title, d.mime_type, to_char(x.created_at, 'YYYY-MM-DD') AS added
    FROM equity.holder_docs x JOIN core.documents d ON d.id = x.document_id WHERE x.captable_id = $1 ORDER BY x.created_at`, [ct])).rows
})
