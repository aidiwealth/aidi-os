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
  return { due: due.length, sent }
})
