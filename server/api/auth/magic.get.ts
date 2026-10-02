// GET /api/auth/magic?token=… -> session cookie, then into the app
export default defineEventHandler(async (event) => {
  const token = getQuery(event).token
  if (typeof token !== 'string' || token.length < 20) return sendRedirect(event, '/login?error=link', 302)
  rateLimit('auth_magic_ip', clientIp(event), 30, 15 * 60 * 1000)
  try {
    await establishSession(event, await verifyToken(token))
  } catch (err) {
    console.warn('[auth] magic link rejected', err instanceof Error ? err.message : err)
    return sendRedirect(event, '/login?error=link', 302)
  }
  return sendRedirect(event, '/', 302)
})
