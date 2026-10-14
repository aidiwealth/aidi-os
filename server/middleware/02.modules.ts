// Switched-off modules: their APIs answer "not found". Public links resolve their workspace first and check there.
export default defineEventHandler(async (event) => {
  const path = getRequestURL(event).pathname
  if (!path.startsWith('/api/') || path.startsWith('/api/public/') || path.startsWith('/api/v1/') || path === '/api/mcp') return
  const m = moduleForApi(path)
  if (m) {
    await requireModule(event, m.code)
    const ov = await moduleRoleOverrides()
    if (ov[m.code]) {
      const s = (event.context.user as SessionUser | undefined) ?? await readSession(event)
      if (s && !canUse(m, s.roles, ov)) throw apiError('forbidden', 'You do not have access to ' + m.label + '. Ask an admin.', 403)
      // An admin let this role use the module on the Modules page: within this module's APIs it acts with the module's
      // usual role (e.g. Team on Payments acts as GP there), still limited to the companies it is assigned to.
      if (s && !s.roles.includes('admin') && !m.roles.some((r) => s.roles.includes(r))) { const grant = m.roles.find((r) => r !== 'admin'); if (grant) s.roles = [...s.roles, grant] }
    }
  }
})
