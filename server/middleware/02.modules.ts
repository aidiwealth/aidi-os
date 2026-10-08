// Switched-off modules: their APIs answer "not found". Public links resolve their workspace first and check there.
export default defineEventHandler(async (event) => {
  const path = getRequestURL(event).pathname
  if (!path.startsWith('/api/') || path.startsWith('/api/public/') || path.startsWith('/api/v1/') || path === '/api/mcp') return
  const m = moduleForApi(path)
  if (m) {
    await requireModule(event, m.code)
    const ov = await moduleRoleOverrides()
    if (ov[m.code]) { const s = await readSession(event); if (s && !canUse(m, s.roles, ov)) throw apiError('forbidden', 'You do not have access to ' + m.label + '. Ask an admin.', 403) }
  }
})
