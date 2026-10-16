// The client signs an agreement from the job link (no Finvry account needed).
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  await rateLimit('agreement_sign_ip', clientIp(event), 20, 60 * 60 * 1000)
  const j = await jobFromToken(getRouterParam(event, 'token'))
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  const b = SignBody.safeParse(await readBody(event))
  if (!id.success) throw apiError('not_found', 'Not found', 404)
  if (!b.success) throw apiError('invalid', 'Type your full name, add your signature and tick the box to agree.')
  const c = (await db().query<{ client_id: string }>('SELECT client_id FROM services.jobs WHERE id = $1', [j.id])).rows[0]!
  await signJobAgreement({ clientId: c.client_id, jobId: j.id, pendingId: id.data, signer: { name: b.data.name, email: j.email }, sig: b.data, ip: clientIp(event), ua: getHeader(event, 'user-agent') ?? '' })
  return { ok: true }
})
