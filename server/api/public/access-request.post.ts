// Ask for a Finvry account while sign-up is by invitation. Saved as a pending request for the Finvry team, with a
// confirmation email. Bot-checked and rate-limited; asking twice with the same email is not an error.
import { z } from 'zod'
const Body = z.object({ website_hp: z.string().max(0).optional(), turnstile_token: z.string().max(4000).optional(),
  name: z.string().trim().min(1).max(120), email: z.string().trim().email().max(254), company: z.string().trim().min(1).max(200), website: z.string().trim().max(300).default(''),
  country: z.string().trim().min(2).max(100), stage: z.enum(['idea', 'pre_seed', 'seed', 'series_a', 'established']), team_size: z.enum(['1', '2-5', '6-20', '21-50', '51+']),
  needs: z.array(z.enum(['reporting', 'investors', 'fundraising', 'cap_table', 'forecast', 'customers', 'group', 'compliance', 'services'])).min(1).max(9), needs_note: z.string().trim().max(1000).default(''),
  source: z.string().trim().max(60).default(''), community: z.string().trim().max(120).default(''), want_demo: z.boolean().default(false) })
export default defineEventHandler(async (event) => {
  await rateLimit('access_ip', clientIp(event), 5, 60 * 60 * 1000)
  const b = Body.safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Fill in your name, work email, company, country, stage, team size and what you need Finvry for.')
  const d = b.data
  if (d.website_hp) throw apiError('invalid', 'Please try again.')
  await verifyHuman(d.turnstile_token, clientIp(event))
  { const ec = await checkEmail(d.email); if (!ec.ok) throw apiError('bad_email', ec.message!, 400) }
  const email = d.email.toLowerCase()
  await rateLimit('access_email', email, 3, 24 * 60 * 60 * 1000)
  const acc = await accessSettings()
  if (acc.mode === 'open') return { ok: true, open: true }
  const flags = accessFlags({ email, company: d.company, website: d.website, needs_note: d.needs_note, stage: d.stage })
  const ins = await asPlatform(() => db().query<{ id: string }>(`INSERT INTO platform.access_requests (name, email, company, website, country, stage, team_size, needs, needs_note, source, community, want_demo, flags)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT (lower(email)) WHERE status IN ('pending', 'demo', 'approved') DO NOTHING RETURNING id`,
    [d.name, email, d.company, d.website || null, d.country, d.stage, d.team_size, d.needs, d.needs_note || null, d.source || null, d.community || null, d.want_demo, flags]))
  if (!ins.rows[0]) return { ok: true, already: true }
  try { await sendAccessReceived(email, d.name) } catch (err) { console.error('[access] receipt email failed', err) }
  slack('finvry.access', 'Access request: ' + d.company + (flags.length ? ' (check: ' + flags.join(', ').replace(/_/g, ' ') + ')' : ''), [['Who', d.name], ['Country', d.country], ['Stage', d.stage.replace('_', '-')], ['Team', d.team_size], ['Needs', d.needs.join(', ').replace(/_/g, ' ')], ...(d.community ? [['Community', d.community] as [string, string]] : []), ...(d.want_demo ? [['Demo', 'Wants a demo'] as [string, string]] : [])], { label: 'Review requests', path: '/platform/access', brand: 'aidi' })
  return { ok: true }
})
