// Meetings for a pipeline (?pipeline=) or an investor (?deal=), with calendar links.
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team')
  const q = getQuery(event), deal = String(q.deal ?? ''), pipe = String(q.pipeline ?? '')
  const r = /^[0-9a-f-]{36}$/.test(deal) ? await db().query<CalEvent & { deal_id: string }>('SELECT m.id, m.deal_id, m.title, m.starts_at, m.ends_at, m.location, m.notes, m.remind_minutes, m.source, m.uid FROM crm.meetings m WHERE m.deal_id = $1 ORDER BY m.starts_at DESC', [deal])
    : /^[0-9a-f-]{36}$/.test(pipe) ? await db().query<CalEvent & { deal_id: string }>("SELECT m.id, m.deal_id, m.title, m.starts_at, m.ends_at, m.location, m.notes, m.remind_minutes, m.source, m.uid, d.investor FROM crm.meetings m JOIN crm.deals d ON d.id = m.deal_id WHERE d.pipeline_id = $1 AND m.ends_at > now() - interval '30 days' ORDER BY m.starts_at", [pipe])
    : await db().query<CalEvent & { deal_id: string }>("SELECT m.id, m.deal_id, m.title, m.starts_at, m.ends_at, m.location, m.notes, m.remind_minutes, m.source, m.uid FROM crm.meetings m WHERE m.ends_at > now() ORDER BY m.starts_at LIMIT 100")
  return r.rows.map((m) => ({ ...m, starts_at: new Date(m.starts_at).toISOString(), ends_at: new Date(m.ends_at).toISOString(), links: calendarLinks({ ...m, starts_at: new Date(m.starts_at).toISOString(), ends_at: new Date(m.ends_at).toISOString() }) }))
})
