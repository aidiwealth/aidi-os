// Every document shared with the client or uploaded by them (requests and chat), newest first, with the reason given.
export default defineEventHandler(async (event) => {
  const u = await requirePortal(event)
  const r = await db().query(
    `SELECT * FROM (SELECT d.id, d.title, d.size_bytes, e.kind, e.body AS reason, e.created_at, j.id AS job_id, j.title AS job FROM services.job_events e JOIN services.jobs j ON j.id = e.job_id JOIN core.documents d ON d.id = e.document_id
        WHERE j.client_id = $1 AND e.visible_to_client AND e.kind IN ('document','client_document')
      UNION ALL SELECT d.id, d.title, d.size_bytes, CASE WHEN m.from_team THEN 'document' ELSE 'client_document' END, coalesce(nullif(m.body, ''), 'Shared in messages'), m.created_at, NULL::uuid, 'Messages' FROM services.messages m JOIN core.documents d ON d.id = m.document_id WHERE m.client_id = $1) x
     ORDER BY created_at DESC LIMIT 300`, [u.clientId])
  return r.rows
})
