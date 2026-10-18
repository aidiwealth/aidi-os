// Save the annual report details (kept in the company's settings for next time).
import { z } from 'zod'
const t = (n: number) => z.string().trim().max(n).default('')
const Adv = z.object({ name: t(200), address: t(600) }).default({ name: '', address: '' })
const Per = z.object({ name: t(200), role: t(120) })
const Body = z.object({
  legal_name: t(200), incorporated_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal('')).default(''), jurisdiction: t(200), legal_form: t(120), principal_activities: t(2000),
  framework: z.enum(['us_gaap', 'ifrs', 'ifrs_sme']).default('ifrs'), fye_month: z.number().int().min(1).max(12).default(12),
  directors: z.array(Per).max(30).default([]), secretary: t(200), cfo: Per.default({ name: '', role: '' }), registered_office: t(600), other_offices: t(1200),
  accountants: z.array(z.object({ name: t(200), address: t(600) })).max(4).default([]), engagement: z.enum(['none', 'compiled', 'reviewed', 'audited']).default('none'), accountants_report: t(20000),
  legal_counsel: Adv, tax_adviser: Adv, registered_agent: Adv, bankers: z.array(t(200)).max(12).default([]), signatory: Per.default({ name: '', role: '' }), share_classes: z.array(z.object({ name: t(120), authorized: z.number().nonnegative().max(1e13).nullable(), par: z.number().nonnegative().max(1e6).nullable() })).max(20).default([]), approved_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal('')).default(''),
  notes: z.object({ going_concern: t(4000), property: t(4000), leases: t(4000), retirement: t(4000), related_parties: t(4000), subsequent_events: t(4000), other: t(6000) }).default({ going_concern: '', property: '', leases: '', retirement: '', related_parties: '', subsequent_events: '', other: '' }) })
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'admin')
  const b = Body.safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Check the report details.')
  const d = { ...b.data, directors: b.data.directors.filter((x) => x.name), accountants: b.data.accountants.filter((x) => x.name), bankers: b.data.bankers.filter(Boolean) }
  const org = (await currentOrg())!
  await asPlatform(() => db().query("UPDATE core.organizations SET settings = settings || jsonb_build_object('report_profile', $2::jsonb) WHERE id = $1", [org.id, JSON.stringify(d)]))
  await audit({ event, actorUserId: user.userId, action: 'financials.report_profile', objectType: 'organization', objectId: org.id })
  return { ok: true, missing: missingOf(d as unknown as import('~/server/utils/fin-report').ReportProfile) }
})
