// End a subscription (cancelled or churned). The workspace's access is changed separately on the customer page.
import { z } from 'zod'
const Body = z.object({ end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), reason: z.enum(['cancelled', 'churned']), note: z.string().trim().max(500).optional() })
export default defineEventHandler(async (event) => {
  const staff = await requirePlatform(event, true)
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  const b = Body.safeParse(await readBody(event))
  if (!id.success || !b.success) throw apiError('invalid', 'Choose the end date and reason.')
  const org = await asPlatform(async () => {
    const s = await db().query<{ organization_id: string; start_date: string; status: string }>("SELECT organization_id, to_char(start_date, 'YYYY-MM-DD') AS start_date, status FROM platform.subscriptions WHERE id = $1", [id.data])
    if (!s.rows[0] || s.rows[0].status === 'ended') throw apiError('not_found', 'Live subscription not found', 404)
    if (b.data.end_date < s.rows[0].start_date) throw apiError('invalid', 'The end date is before the start.')
    await db().query("UPDATE platform.subscriptions SET status = 'ended', ended_at = $2, end_reason = $3, notes = coalesce(notes || E'\\n', '') || coalesce($4, '') WHERE id = $1", [id.data, b.data.end_date, b.data.reason, b.data.note ?? null])
    return s.rows[0].organization_id
  })
  await platformAudit(event, staff.userId, 'subscription_end', org, { reason: b.data.reason, end_date: b.data.end_date })
  return { ok: true }
})
