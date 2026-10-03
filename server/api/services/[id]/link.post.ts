// Create (or replace) the client's link and email it.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'team', 'gp')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw apiError('not_found', 'Job not found', 404)
  const j = await db().query<{ title: string; email: string; contact_name: string }>('SELECT j.title, c.email, c.contact_name FROM services.jobs j JOIN services.clients c ON c.id = j.client_id WHERE j.id = $1', [id.data])
  const job = j.rows[0]
  if (!job) throw apiError('not_found', 'Job not found', 404)
  const link = await issueClientLink(id.data)
  let emailed = false
  try { await sendJobUpdate(job.email, job.contact_name, job.title, 'Follow your request', 'You can see progress, reply and upload documents using the link below.', link); emailed = true }
  catch (err) { console.error('[services] link email failed', err) }
  await audit({ event, actorUserId: user.userId, action: 'services.link_sent', objectType: 'job', objectId: id.data, detail: { emailed } })
  return { ok: true, link, emailed }
})
