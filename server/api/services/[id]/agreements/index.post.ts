// Send the client a Service Level Agreement for an existing job, dated when the work really started (back-dated if
// needed), so the agreement is on file. The client signs from the job in Finvry or from the job link.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireOperator(event)
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  const b = z.object({ effective_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), scope: z.string().trim().max(5000).default(''), notes: z.string().trim().max(2000).default(''), email: z.boolean().default(true) }).safeParse(await readBody(event))
  if (!id.success || !b.success) throw apiError('invalid', 'Choose the agreement date.')
  if (b.data.effective_date > new Date().toISOString().slice(0, 10)) throw apiError('invalid', 'The agreement date cannot be in the future.')
  const j = (await db().query<{ client_id: string; codes: string[] | null; company: string | null; contact_name: string; email: string; client: string; emails_muted: boolean; title: string; on_finvry: boolean }>(
    'SELECT j.client_id, j.codes, co.name AS company, c.contact_name, c.email, c.name AS client, c.emails_muted, j.title, (c.workspace_id IS NOT NULL) AS on_finvry FROM services.jobs j JOIN services.clients c ON c.id = j.client_id LEFT JOIN services.companies co ON co.id = j.company_id WHERE j.id = $1', [id.data])).rows[0]
  if (!j) throw apiError('not_found', 'Job not found', 404)
  const t = await slaText({ clientId: j.client_id, codes: j.codes ?? [], company: j.company, notes: b.data.notes, effective: b.data.effective_date, scope: b.data.scope, signer: { name: '{{signer_name}}', email: '{{signer_email}}' } })
  const row = await asPlatform(() => one<{ id: string }>("INSERT INTO legal.signatures (code, version, title, body, status, effective_date, client_id, job_id, created_by) VALUES ('sla', $1, $2, $3, 'pending', $4, $5, $6, $7) RETURNING id", [t.version, t.title, t.md, b.data.effective_date, j.client_id, id.data, user.userId]))
  await db().query("INSERT INTO services.job_events (job_id, kind, body, visible_to_client, created_by) VALUES ($1, 'note', $2, true, $3)", [id.data, 'We sent you our ' + t.title + ' (effective ' + b.data.effective_date + ') to sign. Open it on this request.', user.userId])
  await db().query('UPDATE services.jobs SET updated_at = now() WHERE id = $1', [id.data])
  let emailed = false
  if (b.data.email && !j.emails_muted) {
    try {
      const link = j.on_finvry ? brands().finvry.url + '/client/jobs/' + id.data : await issueClientLink(id.data)
      await sendAgreementRequest({ to: j.email, contact: j.contact_name, title: t.title, jobTitle: j.title.replace(/^Order: /, ''), effective: b.data.effective_date, link })
      emailed = true
    } catch (e) { console.error('[agreements] send email', e) }
  }
  await audit({ event, actorUserId: user.userId, action: 'services.agreement_sent', objectType: 'job', objectId: id.data, detail: { effective_date: b.data.effective_date } })
  return { ok: true, id: row.id, emailed }
})
