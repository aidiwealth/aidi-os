// Every 15 minutes: email meeting reminders at each meeting's chosen notice time.
import { timingSafeEqual } from 'node:crypto'
export default defineEventHandler(async (event) => {
  const secret = useRuntimeConfig().cronSecret
  const given = getRequestHeader(event, 'x-cron-secret') ?? ''
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) throw apiError('forbidden', 'Forbidden', 403)
  const due = (await asPlatform(() => db().query<{ id: string; organization_id: string; title: string; starts_at: string; location: string | null; investor: string | null; pipeline_id: string | null }>(
    `SELECT m.id, m.organization_id, m.title, m.starts_at, m.location, d.investor, d.pipeline_id FROM crm.meetings m LEFT JOIN crm.deals d ON d.id = m.deal_id
      WHERE m.reminded_at IS NULL AND m.remind_minutes IS NOT NULL AND m.starts_at > now() AND m.starts_at <= now() + make_interval(mins => m.remind_minutes) LIMIT 500`))).rows
  let sent = 0
  for (const m of due) {
    await asPlatform(() => db().query('UPDATE crm.meetings SET reminded_at = now() WHERE id = $1', [m.id]))
    setOrgContext(m.organization_id)
    const link = brands().finvry.url + (m.pipeline_id ? '/fundraising/pipelines/' + m.pipeline_id : '/fundraising')
    for (const to of await orgNotifyEmails()) { try { await sendMeetingReminder(to, m.title, m.investor, m.starts_at, m.location, link); sent++ } catch (err) { console.error('[meetings] reminder failed', err) } }
  }
  // Managed fundraising meetings: email the client 1 day and 1 hour before.
  const rm = (await asPlatform(() => db().query<{ id: string; title: string; starts_at: string; minutes: number; location: string | null; agenda: string | null; investor: string | null; client: string; email: string | null; day: boolean }>(
    `SELECT m.id, m.title, m.starts_at, m.minutes, m.location, m.agenda, i.name AS investor, c.name AS client, c.email, (m.starts_at > now() + interval '75 minutes') AS day
       FROM services.raise_meetings m JOIN services.raise_programs p ON p.id = m.program_id JOIN services.clients c ON c.id = p.client_id LEFT JOIN services.raise_investors i ON i.id = m.investor_id
      WHERE m.starts_at > now() AND ((m.reminded_day IS NULL AND m.starts_at <= now() + interval '24 hours' AND m.starts_at > now() + interval '75 minutes') OR (m.reminded_hour IS NULL AND m.starts_at <= now() + interval '75 minutes')) LIMIT 200`))).rows
  for (const m of rm) {
    await asPlatform(() => db().query('UPDATE services.raise_meetings SET ' + (m.day ? 'reminded_day' : 'reminded_hour') + ' = now() WHERE id = $1', [m.id]))
    if (m.email) { try { await emailRaiseMeeting(m.email, m.client, m, m.day ? 'day' : 'hour'); sent++ } catch (err) { console.error('[raise] reminder', err) } }
  }
  return { due: due.length + rm.length, sent }
})
