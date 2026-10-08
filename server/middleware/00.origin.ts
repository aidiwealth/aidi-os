// Cross-site request check: state-changing API calls must come from this app's own pages. Public webhooks, the public
// pitch form (CORS) and API-key routes are exempt; requests without an Origin header (server-to-server) pass.
export default defineEventHandler((event) => {
  const path = event.path.split('?')[0]!, m = event.method
  if (!path.startsWith('/api/') || ['GET', 'HEAD', 'OPTIONS'].includes(m)) return
  if (path.startsWith('/api/public/') || path.startsWith('/api/v1/') || path === '/api/mcp') return
  const origin = getRequestHeader(event, 'origin')
  if (!origin) return
  let host = ''
  try { host = new URL(origin).host } catch { throw createError({ statusCode: 403, statusMessage: 'Forbidden' }) }
  const own = getRequestHost(event, { xForwardedHost: true })
  if (host !== own) throw createError({ statusCode: 403, statusMessage: 'Cross-site request blocked' })
})
