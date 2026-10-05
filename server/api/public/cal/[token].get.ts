// The private calendar feed of a workspace's pipeline meetings (subscribe in Google, Apple or Outlook Calendar).
export default defineEventHandler(async (event) => {
  const token = String(getRouterParam(event, 'token') ?? '').replace(/\.ics$/, '')
  if (token.length < 20) throw apiError('not_found', 'Not found', 404)
  const c = (await asPlatform(() => db().query<{ organization_id: string; name: string }>('SELECT c.organization_id, o.name FROM crm.calendar c JOIN core.organizations o ON o.id = c.organization_id WHERE c.feed_token = $1', [token]))).rows[0]
  if (!c) throw apiError('not_found', 'Not found', 404)
  const ms = (await asPlatform(() => db().query<CalEvent & { investor: string }>("SELECT m.id, m.title, m.starts_at, m.ends_at, m.location, m.notes, m.remind_minutes, m.uid, d.investor FROM crm.meetings m LEFT JOIN crm.deals d ON d.id = m.deal_id WHERE m.organization_id = $1 AND m.ends_at > now() - interval '60 days' ORDER BY m.starts_at LIMIT 1000", [c.organization_id]))).rows
  setHeader(event, 'content-type', 'text/calendar; charset=utf-8'); setHeader(event, 'cache-control', 'private, max-age=300')
  return buildIcs(ms.map((m) => ({ ...m, starts_at: new Date(m.starts_at).toISOString(), ends_at: new Date(m.ends_at).toISOString(), notes: (m.investor ? 'Investor: ' + m.investor + (m.notes ? '\n\n' + m.notes : '') : m.notes) })), c.name + ' · investor meetings')
})
