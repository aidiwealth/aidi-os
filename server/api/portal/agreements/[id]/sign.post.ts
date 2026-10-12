// The client signs an agreement the team sent for one of their jobs.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const u = await requirePortal(event)
  rateLimit('agreement_sign', u.userId ?? u.clientId, 20, 60 * 60 * 1000)
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  const b = SignBody.safeParse(await readBody(event))
  if (!id.success) throw apiError('not_found', 'Not found', 404)
  if (!b.success) throw apiError('invalid', 'Type your full name, add your signature and tick the box to agree.')
  const row = (await asPlatform(() => db().query<{ job_id: string | null }>("SELECT job_id FROM legal.signatures WHERE id = $1 AND client_id = $2 AND status = 'pending'", [id.data, u.clientId]))).rows[0]
  if (!row?.job_id) throw apiError('not_found', 'This agreement is not waiting for your signature.', 404)
  await signJobAgreement({ clientId: u.clientId, jobId: row.job_id, pendingId: id.data, signer: { name: b.data.name, email: u.email }, sig: b.data, ip: clientIp(event), ua: getHeader(event, 'user-agent') ?? '', userId: u.userId, portalLink: brands().finvry.url + '/client/jobs/' + row.job_id })
  return { ok: true }
})
