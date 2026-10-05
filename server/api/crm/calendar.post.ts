// Save your calendar's private iCal address (or clear it), or reset the feed link.
import { randomBytes } from 'node:crypto'
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp')
  const b = z.object({ source_url: z.string().max(1000).optional(), reset_feed: z.boolean().optional() }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Invalid request.')
  if (b.data.reset_feed) await db().query('UPDATE crm.calendar SET feed_token = $1', [randomBytes(24).toString('base64url')])
  if (b.data.source_url !== undefined) {
    const url = b.data.source_url.trim() ? calendarUrlOk(b.data.source_url) : null
    if (b.data.source_url.trim() && !url) throw apiError('invalid', 'Paste the private iCal address from Google Calendar, iCloud, Outlook, Yahoo, Fastmail or Proton (it starts with https:// or webcal://).')
    await db().query('UPDATE crm.calendar SET source_url = $1', [url])
  }
  return { ok: true }
})
