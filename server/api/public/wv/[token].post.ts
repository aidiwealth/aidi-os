// Family view link: name and email to view a household's holdings (read only). The household is told who looked.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const token = String(getRouterParam(event, 'token') ?? '')
  if (token.length < 20) throw apiError('invalid_link', 'This link is not valid.', 404)
  rateLimit('wm_view', token.slice(0, 12), 60, 60 * 60 * 1000)
  const l = (await asPlatform(() => db().query<{ client_id: string; organization_id: string }>('SELECT client_id, organization_id FROM wm.view_links WHERE token_hash = $1 AND NOT revoked', [sha256(token)]))).rows[0]
  if (!l) throw apiError('invalid_link', 'This link is not valid or has been turned off.', 404)
  setOrgContext(l.organization_id)
  const b = z.object({ name: z.string().trim().min(1).max(120), email: z.string().trim().email().max(254) }).safeParse(await readBody(event))
  const c = (await asPlatform(() => db().query<{ name: string; email: string | null; contact_name: string | null }>('SELECT name, email, contact_name FROM wm.clients WHERE id = $1', [l.client_id]))).rows[0]
  if (!b.success) return { need: true, household: c?.name ?? '' }
  await asPlatform(() => db().query('INSERT INTO wm.views (organization_id, client_id, name, email) VALUES ($1,$2,$3,$4)', [l.organization_id, l.client_id, b.data.name, b.data.email.toLowerCase()]))
  if (c?.email) { try { await sendEmail({ to: c.email, subject: b.data.name + ' viewed your Aidi Wealth holdings', text: b.data.name + ' (' + b.data.email + ') opened your family view of ' + c.name + ' on ' + new Date().toUTCString() + '. You can turn the link off in your Aidi Wealth portal.', html: '<p><b>' + b.data.name.replace(/</g, '&lt;') + '</b> (' + b.data.email.replace(/</g, '&lt;') + ') opened your family view of ' + c.name.replace(/</g, '&lt;') + '.</p><p>You can turn the link off in your Aidi Wealth portal.</p>' }) } catch { /* ignore */ } }
  const s = await asPlatform(() => clientSummary(l.client_id))
  return { need: false, household: c?.name ?? '', summary: { totals: s.totals, by_class: s.by_class, by_platform: s.by_platform, holdings: s.holdings.map((h) => ({ name: h.name, category: h.category, platform: h.platform, currency: h.currency, current_value: h.current_value })) } }
})
