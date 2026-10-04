// The client writes on a job. The team is alerted.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const u = await requirePortal(event)
  rateLimit('portal_msg', u.personId, 30, 60 * 60 * 1000)
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  const b = z.object({ body: z.string().trim().min(1).max(5000) }).safeParse(await readBody(event))
  if (!id.success || !b.success) throw apiError('invalid', 'Write a message.')
  const j = (await db().query<{ title: string; owner_email: string | null }>('SELECT j.title, ou.email AS owner_email FROM services.jobs j LEFT JOIN core.users ou ON ou.id = j.owner_id WHERE j.id = $1 AND j.client_id = $2', [id.data, u.clientId])).rows[0]
  if (!j) throw apiError('not_found', 'Not found', 404)
  await db().query("INSERT INTO services.job_events (job_id, kind, body, visible_to_client) VALUES ($1, 'client_message', $2, true)", [id.data, b.data.body])
  await db().query('UPDATE services.jobs SET updated_at = now() WHERE id = $1', [id.data])
  sendJobClientActivity(j.owner_email, id.data, u.client, j.title, u.name + ' wrote', b.data.body).catch((e) => console.error('[portal] alert failed', e))
  return { ok: true }
})
