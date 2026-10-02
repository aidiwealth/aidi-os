// The modules this person can use right now (for the sidebar and page guard), plus the full list for admins.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const on = await enabledModules()
  const isAdmin = user.roles.includes('admin')
  return MODULES.map((m) => ({
    code: m.code, group: m.group, groupLabel: GROUP_LABEL[m.group], label: m.label, to: m.to, pages: m.pages,
    switchable: m.switchable, enabled: on.has(m.code), usable: on.has(m.code) && canUse(m, user.roles),
    roles: isAdmin ? m.roles : undefined
  }))
})
