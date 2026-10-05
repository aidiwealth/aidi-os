// Calendar sync settings: the private feed of pipeline meetings, and your own calendar's private address.
import { randomBytes } from 'node:crypto'
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team')
  let c = (await db().query<{ feed_token: string; source_url: string | null; scanned_at: string | null }>('SELECT feed_token, source_url, scanned_at FROM crm.calendar LIMIT 1')).rows[0]
  if (!c) { await db().query('INSERT INTO crm.calendar (feed_token) VALUES ($1) ON CONFLICT DO NOTHING', [randomBytes(24).toString('base64url')]); c = (await db().query<{ feed_token: string; source_url: string | null; scanned_at: string | null }>('SELECT feed_token, source_url, scanned_at FROM crm.calendar LIMIT 1')).rows[0]! }
  const feed = brands().finvry.url + '/api/public/cal/' + c.feed_token + '.ics'
  return { feed, webcal: feed.replace(/^https:/, 'webcal:'), google: 'https://calendar.google.com/calendar/r?cid=' + encodeURIComponent(feed.replace(/^https:/, 'webcal:')), source_set: !!c.source_url, source_host: c.source_url ? new URL(c.source_url).hostname : null, scanned_at: c.scanned_at }
})
