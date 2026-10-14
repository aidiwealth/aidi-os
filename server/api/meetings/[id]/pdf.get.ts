// The minutes as a PDF (agenda, minutes, decisions, action items, attendees).
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'team', 'family', 'admin')
  const vis = meetingScope(event, user.userId, 2)
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw apiError('not_found', 'Not found', 404)
  const m = (await db().query<{ title: string; kind: string; held_at: string; location: string | null; attendees: string[]; guests: string | null; agenda: string | null; summary: string | null; notes: string | null; decisions: string | null; actions: MeetingAction[]; entity: string | null; status: string }>("SELECT m.*, e.name AS entity FROM core.meeting_minutes m LEFT JOIN core.entities e ON e.id = m.entity_id WHERE m.id = $1 AND " + vis.sql, [id.data, ...vis.params])).rows[0]
  if (!m) throw apiError('not_found', 'Not found', 404)
  const people = await orgPeople(), nm = (uid?: string | null) => people.find((p) => p.id === uid)?.name ?? ''
  const org = (await currentOrg())!
  const when = new Date(m.held_at).toLocaleString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC'
  const strip = (s: string | null) => (s ?? '').replace(/<[^>]+>/g, '')
  const header = { eyebrow: 'Minutes of meeting', badge: m.status === 'draft' ? 'Draft' : undefined, fields: [
    { label: 'Meeting', value: MEETING_KINDS[m.kind] ?? 'Meeting' }, { label: 'Company', value: m.entity ?? 'Group-wide' },
    { label: 'Date and time', value: when }, { label: 'Location', value: m.location || 'Not recorded' },
    { label: 'Attendees', value: [...m.attendees.map((a) => nm(a)).filter(Boolean), ...(m.guests ? [m.guests] : [])].join(', ') || 'Not recorded', wide: true }] }
  const md = [
    ...(m.summary ? ['## Summary', strip(m.summary), ''] : []), ...(m.agenda ? ['## Agenda', strip(m.agenda), ''] : []), ...(m.notes ? ['## Minutes', strip(m.notes).replace(/^#{1,4} (.+)$/gm, '### $1').replace(/^\*\*([^*]+)\*\*:?\s*$/gm, '### $1'), ''] : []),
    ...(m.decisions ? ['## Decisions', strip(m.decisions), ''] : []),
    ...(m.actions.length ? ['## Action items', '| Action | Owner | Due | Done |', '|---|---|---|---|', ...m.actions.map((a) => '| ' + a.text.replace(/\|/g, '/') + ' | ' + (nm(a.owner_id) || a.owner || '—') + ' | ' + (a.due ?? '—') + ' | ' + (a.done ? 'Yes' : 'No') + ' |'), ''] : [])].join('\n')
  const bytes = await legalPdf(m.entity ?? org.name, [{ title: m.title, md, header }], { logo: org.settings.brand === 'aidi' ? 'aidi' : org.kind === 'company' ? null : 'aidi' })
  setHeader(event, 'content-type', 'application/pdf')
  setHeader(event, 'content-disposition', 'inline; filename="' + ('Minutes - ' + m.title).replace(/[^A-Za-z0-9 ._-]/g, '').slice(0, 120) + '.pdf"')
  return Buffer.from(bytes)
})
