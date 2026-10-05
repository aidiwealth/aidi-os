// End support access and go back to the console session.
export default defineEventHandler(async (event) => {
  const back = getCookie(event, RETURN_COOKIE)
  const s = await readSession(event)
  if (s) await asPlatform(() => db().query("UPDATE core.sessions SET revoked_at = now(), revoked_reason = 'support access ended' WHERE id = $1 AND impersonated_by IS NOT NULL", [s.sessionId]))
  deleteCookie(event, RETURN_COOKIE, { path: '/' })
  if (back) setCookie(event, 'aidi_os_session', back, { httpOnly: true, secure: !import.meta.dev, sameSite: 'lax', path: '/', maxAge: 30 * 86400 })
  return { ok: true, to: back ? '/platform/customers' : '/login' }
})
