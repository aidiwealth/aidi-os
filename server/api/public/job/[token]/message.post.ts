// The client replies. The job owner (or the partners' list) is emailed.
import { z } from 'zod'
const Body = z.object({ body: z.string().trim().min(1).max(5000) })
export default defineEventHandler(async (event) => {
  rateLimit('job_msg', clientIp(event), 30, 60 * 60 * 1000)
  const j = await jobFromToken(getRouterParam(event, 'token'))
  const b = Body.safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Write your message.')
  await db().query("INSERT INTO services.job_events (job_id, kind, body, visible_to_client) VALUES ($1, 'client_message', $2, true)", [j.id, b.data.body])
  await db().query("UPDATE services.jobs SET updated_at = now(), status = CASE WHEN status = 'waiting_client' THEN 'in_progress' ELSE status END WHERE id = $1", [j.id])
  await audit({ event, actorUserId: null, action: 'services.client_message', objectType: 'job', objectId: j.id })
  sendJobClientActivity(j.owner_email, j.id, j.client, j.title, 'sent a message', b.data.body).catch((e) => console.error('[services] alert failed', e))
  return { ok: true }
})
