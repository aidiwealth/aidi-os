import { z } from 'zod'
export default defineEventHandler(async (event) => {
  await requirePlatform(event)
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw apiError('not_found', 'Lead not found', 404)
  return await asPlatform(async () => {
    const l = await db().query(
      `SELECT l.*, l.value_monthly_usd::text, to_char(l.expected_close, 'YYYY-MM-DD') AS expected_close, p.full_name AS owner, o.name AS organization_name
         FROM platform.leads l LEFT JOIN core.users u ON u.id = l.owner_id LEFT JOIN core.people p ON p.id = u.person_id LEFT JOIN core.organizations o ON o.id = l.organization_id
        WHERE l.id = $1`, [id.data])
    if (!l.rows[0]) throw apiError('not_found', 'Lead not found', 404)
    const ev = await db().query(
      `SELECT e.id, e.kind, e.body, e.from_stage, e.to_stage, e.created_at, p.full_name AS by_name FROM platform.lead_events e
         LEFT JOIN core.users u ON u.id = e.created_by LEFT JOIN core.people p ON p.id = u.person_id WHERE e.lead_id = $1 ORDER BY e.created_at DESC`, [id.data])
    return { lead: l.rows[0], events: ev.rows }
  })
})
