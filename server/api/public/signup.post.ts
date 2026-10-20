import { cycleFor } from '~/shared/plan-billing'
// A founder creates their company's Finvry workspace: Startup, Medium or Scale, each starting with a 14-day free trial.
// While sign-up is by invitation (access.ts), it needs the invitation from an approved request, or a partner or
// community code (which skips the queue, within the weekly cap).
// Nigeria is billed in naira, everywhere else in US dollars. We then email a sign-in code to prove the address.
import { z } from 'zod'
const Body = z.object({ website: z.string().max(0).optional(), name: z.string().trim().min(1).max(120), email: z.string().trim().email().max(254),
  company: z.string().trim().min(1).max(200), country: z.string().trim().min(2).max(60), entity_type: z.enum(['us_llc', 'us_corp', 'ng_ltd', 'other']).optional(), state: z.string().max(40).default(''), plan: z.enum(['company_startup', 'company_medium', 'company_scale']), invite: z.string().trim().max(80).optional(), cycle: z.enum(['month', 'year']).optional(), turnstile_token: z.string().max(4000).optional(), agree: SignBody, partner_code: z.string().trim().max(40).optional() })
export default defineEventHandler(async (event) => {
  await rateLimit('signup_ip', clientIp(event), 5, 60 * 60 * 1000)
  const b = Body.safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', b.error.issues.some((i) => i.path[0] === 'agree') ? 'Please sign the Terms of Service and Data Privacy Agreement to continue.' : 'Add your name, a valid email, your company and country.')
  checkSignaturePng(b.data.agree.png, true)
  if (b.data.partner_code) await partnerForCode(b.data.partner_code) // a wrong code stops sign-up with a clear message
  const d = b.data
  // Invite-only: an invitation (for this email) or a partner code; closed: nobody new.
  const acc = await accessSettings()
  const inv = d.invite ? await inviteFor(d.invite) : null
  if (d.invite && !inv) throw apiError('invite', 'This invitation has expired or was already used. Request access again and we will send a new one.', 403)
  if (inv && inv.email.toLowerCase() !== d.email.trim().toLowerCase()) throw apiError('invite', 'This invitation is for ' + inv.email + '. Use that email, or request access for this one.', 403)
  let via: 'open' | 'invite' | 'partner' = 'open'
  if (acc.mode !== 'open') {
    if (inv) via = 'invite'
    else if (d.partner_code && acc.mode === 'invite_only') {
      if (acc.weekly_cap && (await approvedThisWeek()) >= acc.weekly_cap) { slack('critical.capacity', 'Weekly sign-up cap reached (' + acc.weekly_cap + '): a partner-code sign-up was turned away', [['Company', d.company], ['Code', d.partner_code]]); throw apiError('full', 'We have opened all the places for this week. Request access and we will email you as soon as one opens.', 403) }
      via = 'partner'
    } else throw apiError('invite_only', acc.mode === 'closed' ? 'Finvry is not taking new accounts just now. Request access and we will email you when we open again.' : 'Finvry is invite-only for now. Request access, or use the partner code from your VC, accelerator or community.', 403)
  }
  if (d.website) throw apiError('invalid', 'Please try again.')
  await verifyHuman(d.turnstile_token, clientIp(event))
  { const ec = await checkEmail(d.email); if (!ec.ok) throw apiError('bad_email', ec.message!, 400) }
  const email = d.email.toLowerCase()
  await rateLimit('signup_email', email, 3, 60 * 60 * 1000)
  const base = d.company.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'company'
  const slug = (base.length < 2 ? base + '-co' : base) + '-' + Math.random().toString(36).slice(2, 6)
  const nigeria = /^nigeria$/i.test(d.country)
  if (!nigeria && d.entity_type === 'ng_ltd') throw apiError('invalid', 'A Nigerian limited company needs Nigeria as the country.')
  const ws = await createWorkspace(event, null, { name: d.company, slug, kind: 'company', plan_code: d.plan, status: 'trial', trial_days: 14, admin_name: d.name, admin_email: email },
    { invite: false, settings: { country: d.country, currency: nigeria ? 'NGN' : 'USD', public_name: d.company, entity_type: d.entity_type ?? '', state: d.state, trial_used: 'true', signup_via: via, billing_cycle: cycleFor(await planBilling(), d.cycle) } })
  if (d.entity_type && d.entity_type !== 'other') { setOrgContext(ws.id); try { await seedCompanyCompliance(d.entity_type, d.state) } catch (err) { console.error('[signup] compliance seed failed', err) } finally { setOrgContext(null) } }
  await syncPlanSubscription(ws.id).catch((e) => console.error('[signup] plan charge setup failed', e))
  if (d.partner_code) { try { await redeemPartnerCode(ws.id, d.partner_code) } catch (err) { console.error('[signup] partner code', err) } }
  // Terms of Service and Data Privacy Agreement: signed copies in the new workspace's Documents and with our team.
  try { await signSignupAgreements({ orgId: ws.id, ng: nigeria, company: d.company, signer: { name: d.agree.name, email }, sig: d.agree, ip: clientIp(event), ua: getHeader(event, 'user-agent') ?? '' }) } catch (err) { console.error('[signup] agreements failed', err) }
  if (inv) await asPlatform(() => db().query('UPDATE platform.access_requests SET signed_up_org = $2, signed_up_at = now(), invite_hash = NULL, updated_at = now() WHERE id = $1', [inv.id, ws.id]))
  slack('finvry.signup', d.company + ' signed up' + (via === 'partner' ? ' with a partner code' : via === 'invite' ? ' from an invitation' : ''), [['Plan', d.plan.replace('company_', '')], ['Country', d.country], ['Founder', d.name]], { label: 'Open in console', path: '/platform/customers/' + ws.id, brand: 'aidi' })
  try { await startLogin(email, clientIp(event)) } catch (err) { console.error('[signup] code email failed', err); return { ok: true, id: ws.id, emailed: false } }
  return { ok: true, id: ws.id, emailed: true }
})
