import type { H3Event } from 'h3'

export function apiError(code: string, message: string, status = 400) {
  return createError({ statusCode: status, data: { error: { code, message } }, message })
}

// In-memory rate limiter (one App Platform instance). Swap for Redis if Aidi OS ever runs on several.
const hits = new Map<string, { count: number; reset: number }>()
export function rateLimit(bucket: string, id: string, max: number, windowMs: number): void {
  const key = bucket + ':' + id
  const now = Date.now()
  const cur = hits.get(key)
  if (!cur || now > cur.reset) { hits.set(key, { count: 1, reset: now + windowMs }); return }
  cur.count += 1
  if (cur.count > max) throw apiError('rate_limited', 'Too many requests. Try again in ' + Math.ceil((cur.reset - now) / 1000) + 's.', 429)
}

// The caller's address as seen by our own edge: DigitalOcean / Cloudflare set these headers themselves (a client cannot
// forge them through the proxy); otherwise the last X-Forwarded-For hop, added by the proxy in front of the app. The
// first hop is client-controlled and is never used.
export function clientIp(event: H3Event): string {
  const h = (n: string) => (getRequestHeader(event, n) ?? '').trim()
  const edge = h('do-connecting-ip') || h('cf-connecting-ip')
  if (edge && /^[0-9a-f.:]{3,45}$/i.test(edge)) return edge
  const xff = h('x-forwarded-for').split(',').map((x) => x.trim()).filter(Boolean)
  return xff[xff.length - 1] || getRequestIP(event) || 'unknown'
}
// The same address for storing (inet columns): null when it is not a valid address.
export function ipOrNull(event: H3Event): string | null {
  const ip = clientIp(event)
  return /^(\d{1,3}(\.\d{1,3}){3}|[0-9a-f:]{2,45})$/i.test(ip) ? ip : null
}
