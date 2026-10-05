// An LP registers interest in a deal from their portal; the fund team is told.
import { createHash } from 'node:crypto'
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const token = String(getRouterParam(event, 'token') ?? '')
  if (token.startsWith('pv.')) throw apiError('preview', 'This is a preview. LPs register interest from their own link.', 400)
  const b = z.object({ pitch_id: z.string().uuid(), note: z.string().trim().max(1000).default('') }).safeParse(await readBody(event))
  if (!b.success || token.length < 20) throw apiError('invalid', 'Invalid request.')
  rateLimit('lp_interest', token.slice(0, 16), 30, 60 * 60 * 1000)
  const lp = (await asPlatform(() => db().query<{ id: string; name: string; organization_id: string }>('SELECT id, name, organization_id FROM funds.lps WHERE portal_token_hash = $1 AND (portal_token_expires IS NULL OR portal_token_expires > now())', [createHash('sha256').update(token).digest('hex')]))).rows[0]
  if (!lp) throw apiError('invalid_link', 'This link is not valid.', 404)
  setOrgContext(lp.organization_id)
  const p = (await db().query<{ company: string }>("SELECT company FROM deals.pitches WHERE id = $1 AND lp_share <> 'hide'", [b.data.pitch_id])).rows[0]
  if (!p) throw apiError('not_found', 'Not found', 404)
  await db().query('INSERT INTO deals.lp_interest (organization_id, pitch_id, lp_id, note) VALUES ($1,$2,$3,$4) ON CONFLICT (pitch_id, lp_id) DO UPDATE SET note = EXCLUDED.note', [lp.organization_id, b.data.pitch_id, lp.id, b.data.note || null])
  for (const to of await orgNotifyEmails()) { try { await sendEmail({ to, subject: lp.name + ' is interested in ' + p.company, text: lp.name + ' registered interest in ' + p.company + ' from the LP portal.' + (b.data.note ? '\n\nNote: ' + b.data.note : '') + '\n\n' + brands().aidi.url + '/deals/' + b.data.pitch_id, html: '<p><b>' + lp.name.replace(/</g, '&lt;') + '</b> registered interest in <b>' + p.company.replace(/</g, '&lt;') + '</b> from the LP portal.</p>' + (b.data.note ? '<p>Note: ' + b.data.note.replace(/</g, '&lt;') + '</p>' : '') + '<p><a href="' + brands().aidi.url + '/deals/' + b.data.pitch_id + '">Open the deal</a></p>' }) } catch (err) { console.error('[lp interest] email', err) } }
  return { ok: true }
})
