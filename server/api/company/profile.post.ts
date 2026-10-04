// Save company settings. section: profile (name, website, country, currency, legal form, state, reminders) or notifications.
import { z } from 'zod'
const Profile = z.object({ section: z.literal('profile'), name: z.string().trim().min(1).max(200), website: z.string().trim().max(300).refine((v) => v === '' || /^https?:\/\//i.test(v), 'Website must start with http:// or https://').default(''),
  country: z.string().trim().max(60).default(''), currency: z.enum(['USD', 'NGN']), entity_type: z.enum(['us_llc', 'us_corp', 'ng_ltd', 'other', '']).default(''), state: z.string().max(40).default(''), seed: z.boolean().default(false) })
const Notify = z.object({ section: z.literal('notifications'), notify_emails: z.array(z.string().trim().email().max(254)).max(10) })
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  const org = (await currentOrg())!
  if (org.kind !== 'company') throw apiError('not_found', 'Not found', 404)
  const body = await readBody(event)
  const b = z.union([Profile, Notify]).safeParse(body)
  if (!b.success) throw apiError('invalid', b.error.issues[0]?.message?.includes('http') ? b.error.issues[0].message : 'Check the details.')
  let added = 0
  if (b.data.section === 'profile') {
    const d = b.data
    await asPlatform(() => db().query("UPDATE core.organizations SET name = $2, settings = settings || jsonb_build_object('website', $3::text, 'country', $4::text, 'currency', $5::text, 'entity_type', $6::text, 'state', $7::text, 'public_name', $2::text) WHERE id = $1",
      [org.id, d.name, d.website, d.country, d.currency, d.entity_type, d.state]))
    await asPlatform(() => db().query('UPDATE wallet.wallets SET currency = $2 WHERE organization_id = $1 AND balance_minor = 0', [org.id, d.currency]))
    await syncPlanSubscription(org.id)
    if (d.seed && d.entity_type && d.entity_type !== 'other') added = await seedCompanyCompliance(d.entity_type, d.state)
  } else {
    const emails = JSON.stringify((b.data as { notify_emails: string[] }).notify_emails.map((e: string) => e.toLowerCase()))
    await asPlatform(() => db().query("UPDATE core.organizations SET settings = settings || jsonb_build_object('notify_emails', $2::jsonb) WHERE id = $1", [org.id, emails]))
  }
  await audit({ event, actorUserId: user.userId, action: 'company.settings', objectType: 'organization', objectId: org.id, detail: { section: b.data.section, added } })
  return { ok: true, added }
})
