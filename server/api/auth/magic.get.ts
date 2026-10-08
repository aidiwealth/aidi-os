// GET /api/auth/magic?token=… -> session cookie, then into the app
export default defineEventHandler(async (event) => {
  const token = getQuery(event).token
  if (typeof token !== 'string' || token.length < 20) return sendRedirect(event, '/login?error=link', 302)
  rateLimit('auth_magic_ip', clientIp(event), 30, 15 * 60 * 1000)
  try {
    const who = await verifyToken(token)
    const ticket = await mfaTicketFor(who)
    if (ticket) return sendRedirect(event, '/login?mfa=' + encodeURIComponent(ticket), 302)
    await establishSession(event, who)
  } catch (err) {
    console.warn('[auth] magic link rejected', err instanceof Error ? err.message : err)
    return sendRedirect(event, '/login?error=link', 302)
  }
  return sendRedirect(event, '/', 302)
})
