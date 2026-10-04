// Save answers (any time) or submit them. Submitting checks required answers, syncs the company and alerts the team.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  rateLimit('info_save', clientIp(event), 60, 60 * 60 * 1000)
  const r = await infoFromToken(getRouterParam(event, 'token'))
  if (r.status === 'submitted') throw apiError('state', 'This information has already been submitted. Contact us to change anything.', 409)
  const b = z.object({ answers: z.record(z.string().regex(/^[a-z_]{2,48}$/), z.unknown()), submit: z.boolean().default(false) }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Could not read the answers.')
  const json = JSON.stringify(b.data.answers)
  if (json.length > 100000) throw apiError('too_large', 'The answers are too long.', 413)
  const qs = taxQuestions(r.tax_year)
  if (b.data.submit) {
    const files = await db().query<{ field: string }>('SELECT DISTINCT field FROM services.request_files WHERE request_id = $1', [r.id])
    const have = new Set(files.rows.map((f) => f.field))
    const missing = qs.filter((q) => q.required).filter((q) => {
      const v = b.data.answers[q.id]
      if (q.type === 'file') return !have.has(q.id)
      if (Array.isArray(v)) return !v.some((x) => x && typeof x === 'object' && Object.values(x).some((y) => String(y ?? '').trim()))
      return v === undefined || v === null || String(v).trim() === ''
    })
    if (missing.length) throw apiError('missing', 'Please complete: ' + missing.map((q) => q.label).join('; '), 422)
  }
  await db().query("UPDATE services.info_requests SET answers = $2::jsonb, status = $3, submitted_at = CASE WHEN $3 = 'submitted' THEN now() ELSE submitted_at END WHERE id = $1",
    [r.id, json, b.data.submit ? 'submitted' : 'in_progress'])
  if (b.data.submit) {
    await syncTaxAnswers({ ...r, answers: b.data.answers })
    if (r.job_id) {
      await db().query("UPDATE services.jobs SET status = 'in_progress', updated_at = now() WHERE id = $1 AND status IN ('new','waiting_client')", [r.job_id])
      await db().query("INSERT INTO services.job_events (job_id, kind, body, visible_to_client) VALUES ($1, 'client_message', $2, true)", [r.job_id, 'Tax information for ' + r.tax_year + ' submitted.'])
    }
    await audit({ event, actorUserId: null, action: 'services.info_submitted', objectType: 'info_request', objectId: r.id, detail: { tax_year: r.tax_year } })
    if (r.job_id) sendJobClientActivity(null, r.job_id, r.client, r.tax_year + ' tax filing', 'submitted their ' + r.tax_year + ' tax information', '').catch((e) => console.error('[intake] alert failed', e))
  }
  return { ok: true, submitted: b.data.submit }
})
