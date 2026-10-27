// Ask to work with Aidi Wealth from the website. Creates a prospect and emails a link to start the onboarding
// conversation; an adviser approves before the dashboard opens. Bot-checked and rate-limited; asking twice with the
// same email resends the link.
import { z } from 'zod'
const Body = z.object({ website_hp: z.string().max(0).optional(), turnstile_token: z.string().max(4000).optional(),
  name: z.string().trim().min(2).max(120), email: z.string().trim().email().max(254), country: z.enum(['US', 'NG']), phone: z.string().trim().max(40).default(''),
  help: z.array(z.enum(['plan', 'investing', 'retirement', 'children', 'metals', 'everything'])).max(6).default([]), amount: z.enum(['under_50k', '50k_250k', '250k_1m', 'over_1m', '']).default(''), source: z.string().trim().max(120).default('') })
export default defineEventHandler(async (event) => {
  await rateLimit('wm_request_ip', clientIp(event), 5, 60 * 60 * 1000)
  const b = Body.safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Add your name, a valid email and your country.')
  const d = b.data
  if (d.website_hp) throw apiError('invalid', 'Please try again.')
  await verifyHuman(d.turnstile_token, clientIp(event))
  { const ec = await checkEmail(d.email); if (!ec.ok) throw apiError('bad_email', ec.message!, 400) }
  const email = d.email.toLowerCase()
  await rateLimit('wm_request_email', email, 3, 24 * 60 * 60 * 1000)
  setOrgContext(await aidiOrgId())
  return asPlatform(async () => {
    const ex = (await db().query<{ id: string; status: string }>('SELECT c.id, o.status FROM wm.clients c LEFT JOIN wm.onboarding o ON o.client_id = c.id WHERE lower(c.email) = $1 ORDER BY c.created_at DESC LIMIT 1', [email])).rows[0]
    if (ex) { if (ex.status === 'in_progress' || ex.status === 'submitted') { try { await sendWealthStart(email, d.name, null) } catch (e) { console.error('[wm-request] email', e) } } return { ok: true } }
    const cfg = (await wmSettings())[d.country]
    const model = (['advisor', 'managed', 'self_directed'] as const).find((m) => cfg[m])
    if (!model) throw apiError('unavailable', 'Aidi Wealth is not taking clients in ' + (d.country === 'US' ? 'the United States' : 'Nigeria') + ' just yet. Please check back soon.', 400)
    const entity = await wmEntityFor(d.country)
    const c = await one<{ id: string }>("INSERT INTO wm.clients (name, kind, country, model, entity_id, contact_name, email, phone, notes, status) VALUES ($1,'individual',$2,$3,$4,$1,$5,$6,'Requested from the website','prospect') RETURNING id", [d.name, d.country, model, entity, email, d.phone || null])
    await grantPortal(c.id, email, d.name, entity, null, 'request', { help: d.help, amount: d.amount, source: d.source, phone: d.phone })
    try { await sendWealthStart(email, d.name, null) } catch (e) { console.error('[wm-request] email', e) }
    slack('aidi.wealth_client', 'Aidi Wealth request: ' + d.name, [['Country', d.country], ['To invest', d.amount || 'not said'], ['Help with', d.help.join(', ') || 'not said']], { label: 'Onboarding', path: '/wealth-mgmt?t=onboarding' })
    return { ok: true }
  })
})
