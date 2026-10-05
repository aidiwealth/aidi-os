// A founder creates their company's Finvry workspace. Free starts active; paid plans start a 14-day trial.
// Nigeria is billed in naira, everywhere else in US dollars. We then email a sign-in code to prove the address.
import { z } from 'zod'
const Body = z.object({ website: z.string().max(0).optional(), name: z.string().trim().min(1).max(120), email: z.string().trim().email().max(254),
  company: z.string().trim().min(1).max(200), country: z.string().trim().min(2).max(60), entity_type: z.enum(['us_llc', 'us_corp', 'ng_ltd', 'other']).optional(), state: z.string().max(40).default(''), plan: z.enum(['company_free', 'company_startup', 'company_scale']) })
export default defineEventHandler(async (event) => {
  rateLimit('signup_ip', clientIp(event), 5, 60 * 60 * 1000)
  const b = Body.safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Add your name, a valid email, your company and country.')
  const d = b.data
  if (d.website) throw apiError('invalid', 'Please try again.')
  const email = d.email.toLowerCase()
  rateLimit('signup_email', email, 3, 60 * 60 * 1000)
  const base = d.company.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'company'
  const slug = (base.length < 2 ? base + '-co' : base) + '-' + Math.random().toString(36).slice(2, 6)
  const nigeria = /^nigeria$/i.test(d.country)
  if (!nigeria && d.entity_type === 'ng_ltd') throw apiError('invalid', 'A Nigerian limited company needs Nigeria as the country.')
  const ws = await createWorkspace(event, null, { name: d.company, slug, kind: 'company', plan_code: d.plan, status: d.plan === 'company_free' ? 'active' : 'trial', trial_days: 14, admin_name: d.name, admin_email: email },
    { invite: false, settings: { country: d.country, currency: nigeria ? 'NGN' : 'USD', public_name: d.company, entity_type: d.entity_type ?? '', state: d.state, ...(d.plan === 'company_free' ? {} : { trial_used: 'true' }) } })
  if (d.entity_type && d.entity_type !== 'other') { setOrgContext(ws.id); try { await seedCompanyCompliance(d.entity_type, d.state) } catch (err) { console.error('[signup] compliance seed failed', err) } finally { setOrgContext(null) } }
  await syncPlanSubscription(ws.id).catch((e) => console.error('[signup] plan charge setup failed', e))
  try { await startLogin(email, clientIp(event)) } catch (err) { console.error('[signup] code email failed', err); return { ok: true, id: ws.id, emailed: false } }
  return { ok: true, id: ws.id, emailed: true }
})
