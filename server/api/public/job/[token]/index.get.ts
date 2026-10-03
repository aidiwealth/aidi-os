// What the client sees: the job, its status and the client-visible timeline. No login: the link is the key.
export default defineEventHandler(async (event) => {
  rateLimit('job_link', clientIp(event), 120, 60 * 60 * 1000)
  const j = await jobFromToken(getRouterParam(event, 'token'))
  const ev = await db().query(
    `SELECT e.kind, e.body, e.to_status, e.created_at, d.title AS document_title, (e.document_id IS NOT NULL) AS has_document, e.id
       FROM services.job_events e LEFT JOIN core.documents d ON d.id = e.document_id
      WHERE e.job_id = $1 AND e.visible_to_client ORDER BY e.created_at DESC`, [j.id])
  return { title: j.title, service: SERVICES[j.service], status: j.status, statusLabel: STATUS_LABEL[j.status], dueDate: j.due_date, client: j.client, contactName: j.contact_name, events: ev.rows }
})
