// What the monthly management report can cover for a company: the months with figures, the sections (with the
// founder's last choice), and whether customer data is there.
import { MR_SECTIONS, companyAbout } from '~/server/utils/mgmt-report'
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team', 'admin')
  const subject = String(getQuery(event).subject ?? '')
  if (!/^(entity|company):[0-9a-f-]{36}$/.test(subject)) throw apiError('invalid', 'Choose a company.')
  const org = (await currentOrg())!
  const rows = await loadStatements(subject, 'month', (org.settings.currency as string) || 'USD')
  const today = new Date().toISOString().slice(0, 10)
  const months = rows.filter((r) => r.period_end <= today && Object.keys(r.lines).length).map((r) => r.period_end).reverse()
  const mine = ((org.settings.mgmt_report as Record<string, { sections?: string[]; about?: string; chart?: string; pies?: boolean }> | undefined) ?? {})[subject]
  const saved = mine?.sections ?? null
  const main = org.kind === 'company' && subject === 'entity:' + (await companyEntityId())
  const customers = main && (await enabledModules()).has('fin_customers') && (await loadCustomers().catch(() => [])).length > 0
  return { months, sections: MR_SECTIONS.map((s) => ({ ...s, on: saved ? saved.includes(s.key) : s.on, available: s.key !== 'customers' || customers })), saved: !!saved, chart: mine?.chart ?? 'area', pies: mine?.pies ?? true, about: (await companyAbout(subject, mine?.about)).text }
})
