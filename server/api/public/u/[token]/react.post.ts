// An investor reacts to an update (toggle an emoji) or leaves a note, from the email or the web page.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const token = String(getRouterParam(event, 'token') ?? '')
  if (token.length < 30) throw apiError('invalid_link', 'This link is not valid.', 404)
  rateLimit('update_react', token.slice(0, 16), 60, 60 * 60 * 1000)
  const b = z.object({ emoji: z.enum(['up', 'love', 'party', 'rocket', 'clap', 'think']).optional(), on: z.boolean().default(true), note: z.string().trim().max(2000).optional() }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Invalid request.')
  const s = (await asPlatform(() => db().query<{ id: string; organization_id: string; update_id: string; name: string; email: string; title: string }>('SELECT s.id, s.organization_id, s.update_id, i.name, i.email, u.title FROM financials.update_sends s JOIN financials.investors i ON i.id = s.investor_id JOIN financials.updates u ON u.id = s.update_id WHERE s.token_hash = $1', [sha256(token)]))).rows[0]
  if (!s) throw apiError('invalid_link', 'This link is not valid.', 404)
  setOrgContext(s.organization_id)
  if (b.data.emoji) {
    if (b.data.on) await db().query('INSERT INTO financials.update_reactions (organization_id, update_id, send_id, emoji) VALUES ($1,$2,$3,$4) ON CONFLICT (send_id, emoji) DO NOTHING', [s.organization_id, s.update_id, s.id, b.data.emoji])
    else await db().query('DELETE FROM financials.update_reactions WHERE send_id = $1 AND emoji = $2', [s.id, b.data.emoji])
  }
  if (b.data.note) {
    await db().query('INSERT INTO financials.update_notes (organization_id, update_id, send_id, body) VALUES ($1,$2,$3,$4)', [s.organization_id, s.update_id, s.id, b.data.note])
    for (const to of await orgNotifyEmails().catch(() => [] as string[])) { try { await sendEmail({ to, subject: s.name + ' replied to "' + s.title + '"', text: s.name + ' (' + s.email + ') left a note on your update "' + s.title + '":\n\n' + b.data.note, html: '<p><b>' + s.name.replace(/</g, '&lt;') + '</b> (' + s.email + ') left a note on your update <b>' + s.title.replace(/</g, '&lt;') + '</b>:</p><blockquote style="border-left:3px solid #cfe0f5;margin:0;padding:4px 12px;white-space:pre-wrap">' + b.data.note.replace(/</g, '&lt;') + '</blockquote>' }) } catch { /* ignore */ } }
  }
  const mine = (await db().query<{ emoji: string }>('SELECT emoji FROM financials.update_reactions WHERE send_id = $1', [s.id])).rows.map((r) => r.emoji)
  return { ok: true, mine }
})
