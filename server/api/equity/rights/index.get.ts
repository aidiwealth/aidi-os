// Rights on a cap table, with the letter each came from.
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin', 'gp', 'team')
  const ct = await capTableId(getQuery(event).ct)
  return (await db().query(`SELECT r.id, r.holder_id, r.party, r.kind, r.summary, r.impact, r.terms, r.clause, r.document_id, d.title AS doc_title FROM equity.rights r LEFT JOIN core.documents d ON d.id = r.document_id
    WHERE r.captable_id = $1 ORDER BY r.created_at`, [ct])).rows
})
