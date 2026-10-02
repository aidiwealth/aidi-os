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

export function clientIp(event: H3Event): string {
  return getRequestIP(event, { xForwardedFor: true }) ?? 'unknown'
}
