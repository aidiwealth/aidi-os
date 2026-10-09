// Email the founder a personal link for one month's (or quarter's) update. A new link for the same period replaces the old one.
import type { Cadence } from '~/server/utils/portfolio-requests'
import { z } from 'zod'
const Body = z.object({ period: z.string().refine(isPeriod, 'YYYY-MM'), send_email: z.boolean().default(true) })
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'team')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  const b = Body.safeParse(await readBody(event))
  if (!id.success || !b.success) throw apiError('invalid', 'Choose the month.')
  const c = (await db().query<{ report_cadence: Cadence }>('SELECT report_cadence FROM portfolio.companies WHERE id = $1', [id.data])).rows[0]
  if (!c) throw apiError('not_found', 'Company not found', 404)
  const period = periodToDate(b.data.period)
  const me = await db().query<{ full_name: string }>('SELECT p.full_name FROM core.users u JOIN core.people p ON p.id = u.person_id WHERE u.id = $1', [user.userId])
  const r = await createReportRequest(id.data, period, { userId: user.userId, fromName: me.rows[0]?.full_name ?? user.email, sendEmail: b.data.send_email, cadence: c.report_cadence })
  await audit({ event, actorUserId: user.userId, action: 'portfolio.request_sent', objectType: 'company', objectId: id.data, detail: { period, emailed: r.emailed } })
  return { ok: true, ...r }
})
