// Share a job file with the client, or make it team-only again. Sharing emails the client unless their emails are off.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'team', 'gp')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id')), ev = z.string().uuid().safeParse(getRouterParam(event, 'event'))
  const b = z.object({ visible: z.boolean() }).safeParse(await readBody(event))
  if (!id.success || !ev.success || !b.success) throw apiError('invalid', 'Invalid request.')
  const r = (await db().query<{ kind: string; visible_to_client: boolean; title: string; email: string; contact_name: string; client_id: string; emails_muted: boolean; doc: string | null; sensitivity: string | null }>(
    `SELECT e.kind, e.visible_to_client, j.title, c.email, c.contact_name, j.client_id, c.emails_muted, d.title AS doc, d.sensitivity
       FROM services.job_events e JOIN services.jobs j ON j.id = e.job_id JOIN services.clients c ON c.id = j.client_id LEFT JOIN core.documents d ON d.id = e.document_id
      WHERE e.id = $1 AND e.job_id = $2 AND e.document_id IS NOT NULL`, [ev.data, id.data])).rows[0]
  if (!r) throw apiError('not_found', 'File not found', 404)
  if (r.kind === 'client_document') throw apiError('state', 'Files the client uploaded are always visible to them.')
  if (b.data.visible && r.sensitivity && r.sensitivity !== 'normal') throw apiError('sensitive', 'This file is marked ' + r.sensitivity + ' and cannot be shared with the client.')
  await db().query('UPDATE services.job_events SET visible_to_client = $2 WHERE id = $1', [ev.data, b.data.visible])
  let emailed = false
  if (b.data.visible && !r.visible_to_client && !r.emails_muted) {
    try {
      const to = await clientRecipients(r.client_id)
      const link = to.portal ? await portalUrl('/jobs/' + id.data, r.client_id) : await issueClientLink(id.data)
      for (const e of to.portal ? to.emails : [r.email]) await sendJobUpdate(e, r.contact_name, r.title, 'A document has been shared with you', r.doc ?? '', link)
      emailed = true
    } catch (err) { console.error('[services] share email failed', err) }
  }
  await audit({ event, actorUserId: user.userId, action: b.data.visible ? 'services.file_shared' : 'services.file_unshared', objectType: 'job', objectId: id.data, detail: { event: ev.data } })
  return { ok: true, emailed, muted: r.emails_muted }
})
