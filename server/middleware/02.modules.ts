// Switched-off modules: their APIs answer "not found". Public links resolve their workspace first and check there.
export default defineEventHandler(async (event) => {
  const path = getRequestURL(event).pathname
  if (!path.startsWith('/api/') || path.startsWith('/api/public/')) return
  const m = moduleForApi(path)
  if (m) await requireModule(event, m.code)
})
