// Arrive on this address with a session handed over from the other product's address (support sign-in), then open the app.
export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const ok = typeof q.t === 'string' && await acceptHandoff(event, q.t)
  if (!ok) return sendRedirect(event, '/login', 302)
  const back = typeof q.back === 'string' ? q.back : ''
  // Only our own addresses: "Return to console" goes back there (the console session on that address is still signed in).
  if (Object.values(brands()).some((b) => b.url === back)) setCookie(event, RETURN_URL_COOKIE, back, { httpOnly: true, secure: !import.meta.dev, sameSite: 'lax', path: '/', maxAge: 4 * 3600 })
  return sendRedirect(event, '/', 302)
})
