// Add to a job: change status, an internal note, a message to the client, or attach a document. Client-visible items email the client.
import { z } from 'zod'
const Body = z.object({
  kind: z.enum(['status', 'note', 'message', 'document']),
  body: z.string().trim().max(5000).optional(),
  status: z.enum(JOB_STATUSES).optional(),
  document_id: z.string().uuid().optional(),
  visible_to_client: z.boolean().default(false)
})
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'team', 'gp')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  const b = Body.safeParse(await readBody(event))
  if (!id.success || !b.success) throw apiError('invalid', 'Fill in the update.')
  const d = b.data
  const j = await db().query<{ status: string; title: string; email: string; contact_name: string; link_active: boolean; client_id: string }>(
    'SELECT j.status, j.title, c.email, c.contact_name, (j.client_token_expires > now()) AS link_active, j.client_id FROM services.jobs j JOIN services.clients c ON c.id = j.client_id WHERE j.id = $1', [id.data])
  const job = j.rows[0]
  if (!job) throw apiError('not_found', 'Job not found', 404)
  const visible = d.kind === 'message' ? true : d.kind === 'note' ? false : d.visible_to_client
  if ((d.kind === 'note' || d.kind === 'message') && !d.body) throw apiError('invalid', 'Write the note or message.')
  if (d.kind === 'status' && !d.status) throw apiError('invalid', 'Choose a status.')
  if (d.kind === 'document') {
    if (!d.document_id) throw apiError('invalid', 'Choose a document.')
    const doc = await db().query<{ sensitivity: Sensitivity }>('SELECT sensitivity FROM core.documents WHERE id = $1', [d.document_id])
    if (!doc.rows[0] || !canSee(user.roles, doc.rows[0].sensitivity)) throw apiError('not_found', 'Document not found', 404)
    if (visible && doc.rows[0].sensitivity !== 'normal') throw apiError('sensitive', 'Only documents marked Normal can be shared with a client.')
  }
  const client = await db().connect()
  try {
    await client.query('BEGIN')
    if (d.kind === 'status' && d.status !== job.status) {
      await client.query("UPDATE services.jobs SET status = $2, updated_at = now(), completed_at = CASE WHEN $2 = 'completed' THEN now() ELSE NULL END WHERE id = $1", [id.data, d.status])
    }
    await client.query('INSERT INTO services.job_events (job_id, kind, body, from_status, to_status, document_id, visible_to_client, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [id.data, d.kind, d.body || null, d.kind === 'status' ? job.status : null, d.kind === 'status' ? d.status : null, d.document_id ?? null, visible, user.userId])
    await client.query('INSERT INTO core.audit_log (actor_user_id, action, object_type, object_id, detail, ip) VALUES ($1,$2,$3,$4,$5,$6)',
      [user.userId, 'services.' + d.kind, 'job', id.data, JSON.stringify({ visible, status: d.status ?? null }), getRequestIP(event, { xForwardedFor: true }) ?? null])
    await client.query('UPDATE services.jobs SET updated_at = now() WHERE id = $1', [id.data])
    await client.query('COMMIT')
  } catch (err) { await client.query('ROLLBACK'); throw err } finally { client.release() }
  let emailed = false
  if (visible) {
    try {
      const to = await clientRecipients(job.client_id)
      const link = to.portal ? await portalUrl('/jobs/' + id.data, job.client_id) : await issueClientLink(id.data)
      const headline = d.kind === 'status' ? (d.status === 'completed' ? 'Your request is complete' : d.status === 'waiting_client' ? 'We need more information or documents' : 'Status: ' + STATUS_LABEL[d.status!]) : d.kind === 'document' ? 'A document has been shared with you' : 'A message from {{ORG}}'
      for (const e of to.portal ? to.emails : [job.email]) await sendJobUpdate(e, job.contact_name, job.title, headline, d.body ?? '', link)
      emailed = true
    } catch (err) { console.error('[services] client email failed for ' + id.data, err) }
  }
  return { ok: true, emailed }
})
