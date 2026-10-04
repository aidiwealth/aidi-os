// Every document shared with the client or uploaded by them, newest first, with the reason given.
export default defineEventHandler(async (event) => {
  const u = await requirePortal(event)
  const r = await db().query(
    `SELECT d.id, d.title, d.size_bytes, e.kind, e.body AS reason, e.created_at, j.id AS job_id, j.title AS job FROM services.job_events e JOIN services.jobs j ON j.id = e.job_id JOIN core.documents d ON d.id = e.document_id
      WHERE j.client_id = $1 AND e.visible_to_client AND e.kind IN ('document','client_document') ORDER BY e.created_at DESC LIMIT 300`, [u.clientId])
  return r.rows
})
