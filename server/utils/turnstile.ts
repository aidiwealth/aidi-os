// Cloudflare Turnstile check for public forms. Required whenever a secret is configured.
// Server-side siteverify: the token must be fresh, unused, and solved on one of our own sites (turnstileHostnames).
export async function verifyTurnstile(token: string | undefined, ip: string): Promise<void> {
  const c = useRuntimeConfig() as unknown as { turnstileSecret: string; turnstileHostnames: string }
  const secret = c.turnstileSecret
  if (!secret) { if (!import.meta.dev) console.warn('[turnstile] NUXT_TURNSTILE_SECRET not set: form relies on honeypot and rate limits'); return }
  if (!token || token.length > 2048) throw apiError('captcha', 'Please complete the check and try again.', 400)
  let data: { success?: boolean; hostname?: string; action?: string; 'error-codes'?: string[] }
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: new URLSearchParams({ secret, response: token, ...(ip !== 'unknown' ? { remoteip: ip } : {}) }),
      signal: AbortSignal.timeout(10_000)
    })
    if (!res.ok) throw new Error('siteverify returned ' + res.status)
    data = await res.json() as typeof data
  } catch (e) {
    console.error('[turnstile] siteverify failed', (e as Error).message)
    throw apiError('captcha', 'The check could not be confirmed. Please try again.', 403)
  }
  if (!data.success) {
    console.warn('[turnstile] rejected', (data['error-codes'] || []).join(','))
    throw apiError('captcha', 'The check did not pass. Please try again.', 400)
  }
  // A token solved on another site that uses our site key is refused. Local hosts count only in development.
  const allowed = (c.turnstileHostnames || '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean)
  if (import.meta.dev) allowed.push('localhost', '127.0.0.1')
  const host = (data.hostname || '').toLowerCase()
  if (allowed.length && !allowed.includes(host)) {
    console.warn('[turnstile] token from unexpected hostname', host)
    throw apiError('captcha', 'The check did not pass. Please try again.', 400)
  }
}
