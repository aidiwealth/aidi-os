// Download one meeting as an .ics file (opens in Apple Calendar, Outlook, Google Calendar and others).
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team')
  const id = String(getRouterParam(event, 'id') ?? '')
  const m = /^[0-9a-f-]{36}$/.test(id) ? (await db().query<CalEvent>('SELECT id, title, starts_at, ends_at, location, notes, remind_minutes, uid FROM crm.meetings WHERE id = $1', [id])).rows[0] : undefined
  if (!m) throw apiError('not_found', 'Not found', 404)
  setHeader(event, 'content-type', 'text/calendar; charset=utf-8')
  setHeader(event, 'content-disposition', 'attachment; filename="' + m.title.replace(/[^A-Za-z0-9 ._-]/g, '').slice(0, 60) + '.ics"')
  return buildIcs([{ ...m, starts_at: new Date(m.starts_at).toISOString(), ends_at: new Date(m.ends_at).toISOString() }])
})
