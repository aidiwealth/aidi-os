// Switched-off modules: their APIs (including public links and forms) answer "not found".
export default defineEventHandler(async (event) => {
  const path = getRequestURL(event).pathname
  if (!path.startsWith('/api/')) return
  const m = moduleForApi(path)
  if (m) await requireModule(event, m.code)
})
