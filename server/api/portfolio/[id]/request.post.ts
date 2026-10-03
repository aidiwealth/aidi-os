// Email the founder a personal link for one month's update. A new link for the same month replaces the old one.
import { z } from 'zod'
const Body = z.object({ period: z.string().refine(isPeriod, 'YYYY-MM'), send_email: z.boolean().default(true) })
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'team')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  const b = Body.safeParse(await readBody(event))
  if (!id.success || !b.success) throw apiError('invalid', 'Choose the month.')
  const c = await db().query<{ name: string; founder_name: string; founder_email: string }>('SELECT name, founder_name, founder_email FROM portfolio.companies WHERE id = $1', [id.data])
  const co = c.rows[0]
  if (!co) throw apiError('not_found', 'Company not found', 404)
  const period = periodToDate(b.data.period)
  const token = randomToken()
  await db().query("UPDATE portfolio.requests SET expires_at = now() WHERE company_id = $1 AND period = $2 AND expires_at > now()", [id.data, period])
  await db().query(
    "INSERT INTO portfolio.requests (company_id, period, token_hash, expires_at, sent_by) VALUES ($1,$2,$3, now() + make_interval(days => $4), $5)",
    [id.data, period, sha256(token), LINK_DAYS, user.userId])
  const link = (await appUrl()) + '/report/' + token
  let emailed = false
  if (b.data.send_email) {
    const me = await db().query<{ full_name: string }>('SELECT p.full_name FROM core.users u JOIN core.people p ON p.id = u.person_id WHERE u.id = $1', [user.userId])
    try { await sendReportRequest(co.founder_email, co.founder_name, co.name, periodLabel(period), link, me.rows[0]?.full_name ?? user.email); emailed = true }
    catch (err) { console.error('[portfolio] request email failed', err) }
  }
  await audit({ event, actorUserId: user.userId, action: 'portfolio.request_sent', objectType: 'company', objectId: id.data, detail: { period, emailed } })
  return { ok: true, link, emailed }
})
