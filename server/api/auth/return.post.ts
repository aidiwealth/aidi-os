// End support access and go back to the console session.
export default defineEventHandler(async (event) => {
  const back = getCookie(event, RETURN_COOKIE), backUrl = getCookie(event, RETURN_URL_COOKIE)
  const s = await readSession(event)
  if (s) {
    await asPlatform(() => db().query("UPDATE core.sessions SET revoked_at = now(), revoked_reason = 'support access ended' WHERE id = $1 AND impersonated_by IS NOT NULL", [s.sessionId]))
    if (s.support) await asPlatform(() => db().query('UPDATE core.impersonations SET ended_at = now() WHERE id = $1 AND ended_at IS NULL', [s.support!.id]))
    forgetSessions((_v, sid) => sid === s.sessionId)
  }
  deleteCookie(event, RETURN_COOKIE, { path: '/' })
  if (back) setCookie(event, 'aidi_os_session', back, { httpOnly: true, secure: !import.meta.dev, sameSite: 'lax', path: '/', maxAge: 30 * 86400 })
  if (!back && backUrl && Object.values(brands()).some((b) => b.url === backUrl)) { // handed over from the console's address
    deleteCookie(event, RETURN_URL_COOKIE, { path: '/' }); deleteCookie(event, 'aidi_os_session', { path: '/' })
    return { ok: true, to: backUrl + '/services' }
  }
  return { ok: true, to: back ? '/platform/customers' : '/login' }
})
