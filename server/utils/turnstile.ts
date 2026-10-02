// Cloudflare Turnstile check for public forms. Required whenever a secret is configured.
export async function verifyTurnstile(token: string | undefined, ip: string): Promise<void> {
  const secret = useRuntimeConfig().turnstileSecret
  if (!secret) { if (!import.meta.dev) console.warn('[turnstile] NUXT_TURNSTILE_SECRET not set: form relies on honeypot and rate limits'); return }
  if (!token) throw apiError('captcha', 'Please complete the check and try again.', 400)
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: new URLSearchParams({ secret, response: token, ...(ip !== 'unknown' ? { remoteip: ip } : {}) })
  })
  if (!res.ok) throw new Error('Turnstile verify returned ' + res.status)
  const data = await res.json() as { success?: boolean }
  if (!data.success) throw apiError('captcha', 'The check did not pass. Please try again.', 400)
}
