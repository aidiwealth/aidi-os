// Every /api route needs a signed-in user unless it is on this allow-list (public endpoints sit above the gate).
const PUBLIC = ['/api/ping', '/api/health', '/api/auth/request', '/api/auth/verify-otp', '/api/auth/magic', '/api/auth/logout']
export default defineEventHandler(async (event) => {
  const path = getRequestURL(event).pathname
  if (!path.startsWith('/api/') || PUBLIC.includes(path) || path.startsWith('/api/public/')) return
  const s = await readSession(event)
  if (!s) throw apiError('unauthorized', 'Sign in required', 401)
  event.context.user = s
})
