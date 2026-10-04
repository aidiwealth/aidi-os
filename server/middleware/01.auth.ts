// Every /api route needs a signed-in user unless it is on this allow-list (public endpoints sit above the gate).
// The signed-in person's workspace becomes the database context for the whole request.
const PUBLIC = ['/api/ping', '/api/health', '/api/auth/request', '/api/auth/verify-otp', '/api/auth/magic', '/api/auth/logout']
export default defineEventHandler(async (event) => {
  event.context.orgId = null
  event.context.dbBypass = false
  const path = getRequestURL(event).pathname
  if (!path.startsWith('/api/') || PUBLIC.includes(path) || path.startsWith('/api/public/') || path.startsWith('/api/portal/')) return
  const s = await readSession(event)
  if (!s) throw apiError('unauthorized', 'Sign in required', 401)
  event.context.user = s
  event.context.orgId = s.orgId
})
