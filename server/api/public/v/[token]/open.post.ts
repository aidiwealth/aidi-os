// Open a shared forecast or cap table: records who and when (and tells the company, at most hourly per link), then
// returns the figures. Cap tables leave out holders' emails.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  await rateLimit('share_open', clientIp(event), 120, 60 * 60 * 1000)
  const b = z.object({ email: z.string().trim().max(254).default(''), name: z.string().trim().max(200).default('') }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Invalid request.')
  const l = await findShare(String(getRouterParam(event, 'token') ?? ''))
  if (!l || !l.active) throw apiError('not_found', 'This link is not valid.', 404)
  if (l.expired) throw apiError('expired', 'This link has expired.', 410)
  const email = b.data.email.toLowerCase()
  if (l.require_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw apiError('email', 'Enter your email to view.', 400)
  setOrgContext(l.organization_id)
  const obj = await shareObject(l.kind, l.object_id)
  if (!obj) throw apiError('not_found', 'This link is not valid.', 404)
  const v = await one<{ id: string }>('INSERT INTO financials.share_views (organization_id, link_id, email, name, ip, user_agent) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
    [l.organization_id, l.id, email || null, b.data.name || null, clientIp(event), String(getHeader(event, 'user-agent') ?? '').slice(0, 400)])
  await db().query('UPDATE financials.share_links SET views = views + 1, last_viewed_at = now() WHERE id = $1', [l.id])
  if (l.notify && (!l.last_viewed_at || Date.now() - new Date(l.last_viewed_at).getTime() > 3600000)) {
    const to = await orgNotifyEmails(), what = (l.kind === 'forecast' ? 'Forecast: ' : 'Cap table: ') + obj.name + ' (' + l.label + (email ? ', ' + email : '') + ')'
    for (const e of to) sendShareViewedEmail(e, what, brands().finvry.url + (l.kind === 'forecast' ? '/forecast?f=' : '/cap-table?ct=') + l.object_id + '&share=1').catch(() => {})
  }
  if (l.kind === 'forecast') {
    const f = (await db().query<{ assumptions: unknown; updated_at: string }>('SELECT assumptions, updated_at FROM financials.forecasts WHERE id = $1', [l.object_id])).rows[0]
    return { view_id: v.id, forecast: { name: obj.name, assumptions: f?.assumptions, updated_at: f?.updated_at } }
  }
  const d = await loadCapTable(l.object_id)
  return { view_id: v.id, captable: { name: obj.name, data: { ...d, holders: d.holders.map((h) => ({ id: h.id, name: h.name, kind: h.kind })) } } }
})
