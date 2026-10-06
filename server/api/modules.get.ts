// The modules this person can use right now (for the sidebar and page guard), plus the full list for admins.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const on = await enabledModules()
  const plan = await planModules()
  const isAdmin = user.roles.includes('admin')
  const company = (await currentOrg())?.kind === 'company'
  const paid = company ? new Set((await asPlatform(() => db().query<{ modules: string[] }>("SELECT modules FROM core.plans WHERE code = 'company_scale'"))).rows[0]?.modules ?? []) : new Set<string>()
  const raiseOn = company && (await currentOrg())?.settings.raise_enabled === true
  const ops = !company && ((await currentOrg())?.settings.services_operator === true || (await currentOrg())?.settings.services_operator === 'true')
  return MODULES.filter((m) => (m.code !== 'client_raise' || raiseOn) && (m.code !== 'cs_raise' || ops)).map((m) => ({
    navHidden: ['analytics', 'fo_analytics', 'cs_analytics'].includes(m.code),
    code: m.code, group: !company && (m.code === 'contacts' || m.code === 'updates') ? 'vc' : m.group, groupLabel: company ? (m.group === 'fin' ? 'Investors' : m.group === 'fo' ? 'Company' : GROUP_LABEL[m.group]) : (m.code === 'contacts' || m.code === 'updates' ? GROUP_LABEL.vc : GROUP_LABEL[m.group]), label: company && m.code === 'directory' ? 'Trusted partners' : !company && m.code === 'contacts' ? 'LP & partner contacts' : !company && m.code === 'updates' ? 'LP reports' : m.label, to: m.to, pages: m.pages,
    switchable: m.switchable, inPlan: !m.switchable || plan.has(m.code), enabled: on.has(m.code), usable: on.has(m.code) && canUse(m, user.roles) && (m.code !== 'modules' || user.platform) && !(company && m.code === 'directory'),
    locked: company && !on.has(m.code) && paid.has(m.code) && canUse(m, user.roles),
    roles: isAdmin ? m.roles : undefined
  }))
})
