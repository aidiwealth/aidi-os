// Shared financial plan: name and email first (the household is told), then the latest report and growth history.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const token = String(getRouterParam(event, 'token') ?? '')
  if (token.length < 20) throw apiError('invalid_link', 'This link is not valid.', 404)
  rateLimit('wm_report', token.slice(0, 12), 60, 60 * 60 * 1000)
  const l = (await asPlatform(() => db().query<{ client_id: string; organization_id: string }>('SELECT client_id, organization_id FROM wm.report_links WHERE token_hash = $1 AND NOT revoked', [sha256(token)]))).rows[0]
  if (!l) throw apiError('invalid_link', 'This link is not valid or has been turned off.', 404)
  setOrgContext(l.organization_id)
  const c = (await asPlatform(() => db().query<{ name: string; email: string | null }>('SELECT name, email FROM wm.clients WHERE id = $1', [l.client_id]))).rows[0]
  const b = z.object({ name: z.string().trim().min(1).max(120), email: z.string().trim().email().max(254) }).safeParse(await readBody(event))
  if (!b.success) return { need: true, household: c?.name ?? '' }
  await asPlatform(() => db().query("INSERT INTO wm.views (organization_id, client_id, name, email, kind) VALUES ($1,$2,$3,$4,'report')", [l.organization_id, l.client_id, b.data.name, b.data.email.toLowerCase()]))
  if (c?.email) { try { await sendEmail({ to: c.email, subject: b.data.name + ' viewed your financial plan', text: b.data.name + ' (' + b.data.email + ') opened the shared financial plan for ' + c.name + '. You can turn the link off in your Aidi Wealth portal.', html: '<p><b>' + b.data.name.replace(/</g, '&lt;') + '</b> (' + b.data.email.replace(/</g, '&lt;') + ') opened the shared financial plan for ' + c.name.replace(/</g, '&lt;') + '.</p>' }) } catch { /* ignore */ } }
  const p = await asPlatform(() => planGet(l.client_id))
  return { need: false, household: c?.name ?? '', report: p.report, history: p.history }
})
