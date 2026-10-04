// A private, expiring link to chosen metrics for a subject. You are emailed when it is viewed (at most hourly).
import { z } from 'zod'
const Body = z.object({ title: z.string().trim().min(1).max(200), subject: z.string().max(80), period_type: z.enum(['month', 'quarter', 'year']).default('month'),
  currency: z.string().regex(/^[A-Z]{3}$/).default('USD'), metrics: z.array(z.string().max(70)).min(1).max(8), days: z.coerce.number().int().min(1).max(365).default(30) })
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  const b = Body.safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Give the link a title and pick at least one metric.')
  const d = b.data
  await subjectName(d.subject)
  const token = randomToken()
  const r = await one<{ id: string }>("INSERT INTO financials.shares (title, subject, currency, period_type, metrics, token_hash, expires_at, created_by) VALUES ($1,$2,$3,$4,$5,$6, now() + make_interval(days => $7), $8) RETURNING id",
    [d.title, d.subject, d.currency, d.period_type, d.metrics, sha256(token), d.days, user.userId])
  await audit({ event, actorUserId: user.userId, action: 'financials.share', objectType: 'fin_share', objectId: r.id, detail: { subject: d.subject, metrics: d.metrics } })
  return { ok: true, id: r.id, url: (await appUrl()) + '/share/' + token }
})
