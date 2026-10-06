// Managed fundraising: per-client program run by the services desk, success fee on money closed.
export const RAISE_STATUS: Record<string, string> = { target: 'To contact', contacted: 'Contacted', meeting: 'Meeting', diligence: 'Due diligence', term_sheet: 'Term sheet', committed: 'Committed', closed: 'Closed', passed: 'Passed' }
export async function raiseView(programId: string, forClient: boolean) {
  const p = (await db().query<Record<string, unknown> & { id: string; fee_pct: string; target: string | null; currency: string }>("SELECT p.*, c.name AS client, c.email AS client_email FROM services.raise_programs p JOIN services.clients c ON c.id = p.client_id WHERE p.id = $1", [programId])).rows[0]
  if (!p) return null
  const inv = (await db().query<{ id: string; name: string; firm: string | null; email: string | null; ticket: string | null; committed: string | null; status: string; next_step: string | null; notes: string | null; terms: string | null; visible: boolean; updated_at: string }>(
    'SELECT id, name, firm, email, ticket, committed, status, next_step, notes, terms, visible, updated_at FROM services.raise_investors WHERE program_id = $1 ' + (forClient ? 'AND visible ' : '') + 'ORDER BY sort, created_at', [programId])).rows
  const meetings = (await db().query("SELECT m.id, m.title, m.starts_at, m.minutes, m.location, m.agenda, m.investor_id, i.name AS investor FROM services.raise_meetings m LEFT JOIN services.raise_investors i ON i.id = m.investor_id WHERE m.program_id = $1 ORDER BY m.starts_at", [programId])).rows
  const n = (x: string | null) => (x == null ? 0 : Number(x))
  const committed = inv.filter((i) => ['committed', 'closed'].includes(i.status)).reduce((a, i) => a + n(i.committed ?? i.ticket), 0)
  const closed = inv.filter((i) => i.status === 'closed').reduce((a, i) => a + n(i.committed ?? i.ticket), 0)
  const pipeline = inv.filter((i) => !['passed'].includes(i.status)).reduce((a, i) => a + n(i.ticket), 0)
  const fee = Math.round(closed * Number(p.fee_pct)) / 100
  return { program: p, investors: inv, meetings, totals: { target: n(p.target), committed, closed, pipeline, fee, fee_pct: Number(p.fee_pct), count: inv.length, active: inv.filter((i) => !['passed', 'closed'].includes(i.status)).length } }
}
export async function emailRaiseMeeting(to: string, client: string, m: { title: string; starts_at: string; minutes: number; location: string | null; agenda: string | null; investor: string | null }, kind: 'new' | 'day' | 'hour', toInvestor = false) {
  const when = new Date(m.starts_at).toUTCString().replace(':00 GMT', ' UTC')
  const subj = kind === 'new' ? 'Investor meeting scheduled: ' + m.title : kind === 'day' ? 'Tomorrow: ' + m.title : 'In 1 hour: ' + m.title
  const link = toInvestor ? '' : brands().finvry.url + '/client/raise'
  const txt = (toInvestor ? (kind === 'new' ? 'Your meeting with ' + client + ' is confirmed.' : kind === 'day' ? 'Reminder: your meeting with ' + client + ' is tomorrow.' : 'Reminder: your meeting with ' + client + ' starts in 1 hour.') : kind === 'new' ? 'We have scheduled an investor meeting for ' + client + '.' : kind === 'day' ? 'Reminder: your investor meeting is tomorrow.' : 'Reminder: your investor meeting starts in 1 hour.') + '\n\n' + m.title + (m.investor ? ' with ' + m.investor : '') + '\n' + when + ' (' + m.minutes + ' minutes)' + (m.location ? '\n' + m.location : '') + (m.agenda ? '\n\n' + m.agenda : '') + '\n\n' + link
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  const html = '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#0c1a2e;max-width:560px"><p style="margin:0 0 12px">' + esc(txt.split('\n\n')[0]!) + '</p><p style="margin:0 0 12px"><b>' + esc(m.title) + '</b>' + (m.investor ? ' with ' + esc(m.investor) : '') + '<br>' + esc(when) + ' (' + m.minutes + ' minutes)' + (m.location ? '<br>' + (/^https?:/.test(m.location) ? '<a href="' + esc(m.location) + '">' + esc(m.location) + '</a>' : esc(m.location)) : '') + '</p>' + (m.agenda ? '<p style="margin:0 0 12px;white-space:pre-wrap">' + esc(m.agenda) + '</p>' : '') + (link ? '<p><a href="' + link + '" style="color:#1c4f9c">Open your fundraising tracker</a></p>' : '') + '</div>'
  await sendEmail({ to, subject: subj, text: txt, html, fromName: 'Finvry' })
}
