// Send a client a tax filing information link (no login). Opens or links a job that waits on the client.
import { z } from 'zod'
const Body = z.object({ client_id: z.string().uuid(), company_id: z.string().uuid(), tax_year: z.coerce.number().int().min(2015).max(2100), email: z.string().trim().email().max(254).optional().or(z.literal('').transform(() => undefined)) })
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'team', 'gp')
  const b = Body.safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Choose the company and the tax year.')
  const d = b.data
  const co = (await db().query<{ name: string; email: string; client: string }>('SELECT co.name, c.email, c.name AS client FROM services.companies co JOIN services.clients c ON c.id = co.client_id WHERE co.id = $1 AND co.client_id = $2', [d.company_id, d.client_id])).rows[0]
  if (!co) throw apiError('invalid', 'Choose one of this client\'s companies.')
  const to = (d.email ?? co.email).toLowerCase()
  const job = await one<{ id: string }>("INSERT INTO services.jobs (client_id, company_id, service, title, status, owner_id, created_by) VALUES ($1,$2,'tax_filing',$3,'waiting_client',$4,$4) RETURNING id",
    [d.client_id, d.company_id, d.tax_year + ' tax filing: ' + co.name, user.userId])
  const r = await one<{ id: string }>("INSERT INTO services.info_requests (client_id, company_id, job_id, tax_year, sent_to, token_hash, expires_at, created_by) VALUES ($1,$2,$3,$4,$5, gen_random_uuid()::text, now(), $6) RETURNING id",
    [d.client_id, d.company_id, job.id, d.tax_year, to, user.userId])
  const link = await issueInfoLink(r.id)
  await db().query("INSERT INTO services.job_events (job_id, kind, body, visible_to_client, created_by) VALUES ($1, 'note', $2, false, $3)", [job.id, 'Tax information requested from ' + to + ' for ' + d.tax_year + '.', user.userId])
  let emailed = false
  try { await sendInfoRequestEmail(to, co.client, co.name, d.tax_year, link); emailed = true } catch (err) { console.error('[intake] email failed', err) }
  await audit({ event, actorUserId: user.userId, action: 'services.info_request', objectType: 'client', objectId: d.client_id, detail: { tax_year: d.tax_year, to } })
  return { ok: true, id: r.id, job_id: job.id, link, emailed }
})
