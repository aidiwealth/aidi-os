// What the monthly management report can cover for a company: the months with figures, the sections (with the
// founder's last choice), and whether customer data is there.
import { MR_SECTIONS, companyAbout } from '~/server/utils/mgmt-report'
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team', 'admin')
  // Without a subject (Retention, Customers): the company itself.
  const ent0 = await companyEntityId().catch(() => null)
  const subject = String(getQuery(event).subject || '') || (ent0 ? 'entity:' + ent0 : '')
  if (subject !== 'group' && !/^(entity|company):[0-9a-f-]{36}$/.test(subject)) throw apiError('invalid', 'Choose a company.')
  const org = (await currentOrg())!
  const rows = await loadStatements(subject, 'month', await subjectCurrency(subject))
  const today = new Date().toISOString().slice(0, 10)
  const months = rows.filter((r) => r.period_end <= today && Object.keys(r.lines).length).map((r) => r.period_end).reverse()
  const mine = ((org.settings.mgmt_report as Record<string, { sections?: string[]; about?: string; chart?: string; pies?: boolean; growth_seen?: boolean }> | undefined) ?? {})[subject]
  const saved = mine?.sections ?? null
  // Customer sections: the company's own customers, or the group's combined.
  const customers = org.kind === 'company' && (await enabledModules()).has('fin_customers') && ((await withCustFor(subject, () => loadCustomers()).catch(() => null)) ?? []).length > 0
  // The report used to have one customer section: a saved choice with it keeps retention too.
  const on = (k: string) => (saved ? saved.includes(k) || (k === 'retention' && saved.includes('customers')) || (['sales', 'marketing', 'banking', 'stage'].includes(k) && !mine?.growth_seen) : MR_SECTIONS.find((x) => x.key === k)!.on)
  // Treasury bills or other securities in the figures: the dialog asks whether to show them with cash.
  const has_securities = rows.some((r) => typeof r.lines.investments === 'number' && r.lines.investments !== 0)
  // Sales, Marketing, Banking and Stage: offered when the plan has them and there is something to show.
  const growth = await growthAvailable(event, subject).catch(() => ({} as Record<string, boolean>))
  const GROWTH = new Set(['sales', 'marketing', 'banking', 'stage'])
  return { has_securities, subject, groups: customers ? ((await withCustFor(subject, () => customerGroups())) ?? []) : [], months, sections: MR_SECTIONS.map((s) => ({ ...s, on: on(s.key), available: GROWTH.has(s.key) ? !!growth[s.key] : (s.key !== 'customers' && s.key !== 'retention') || customers })), saved: !!saved, chart: mine?.chart ?? 'area', pies: mine?.pies ?? true, about: (await companyAbout(subject, mine?.about)).text }
})
