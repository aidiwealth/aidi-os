// The modules this person can use right now (for the sidebar and page guard), plus the full list for admins.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const on = await enabledModules()
  const plan = await planModules()
  const isAdmin = user.roles.includes('admin')
  const company = (await currentOrg())?.kind === 'company'
  return MODULES.map((m) => ({
    code: m.code, group: m.group, groupLabel: company && m.group === 'fo' ? 'Company' : GROUP_LABEL[m.group], label: m.label, to: m.to, pages: m.pages,
    switchable: m.switchable, inPlan: !m.switchable || plan.has(m.code), enabled: on.has(m.code), usable: on.has(m.code) && canUse(m, user.roles) && (m.code !== 'modules' || user.platform),
    roles: isAdmin ? m.roles : undefined
  }))
})
