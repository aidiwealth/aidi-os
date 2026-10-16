import type { H3Event } from 'h3'

export function apiError(code: string, message: string, status = 400) {
  return createError({ statusCode: status, data: { error: { code, message } }, message })
}

// Rate limits shared by every app instance: a fixed window counted in Postgres (core.rate_hits). A quick in-memory
// count runs first so a flood is refused without touching the database; if the database is unreachable the
// in-memory count still applies.
const hits = new Map<string, { count: number; reset: number }>()
const limited = (wait: number) => apiError('rate_limited', 'Too many requests. Try again in ' + Math.max(1, Math.ceil(wait / 1000)) + 's.', 429)
export async function rateLimit(bucket: string, id: string, max: number, windowMs: number): Promise<void> {
  const key = bucket + ':' + id
  const now = Date.now()
  const cur = hits.get(key)
  if (!cur || now > cur.reset) hits.set(key, { count: 1, reset: now + windowMs })
  else { cur.count += 1; if (cur.count > max) throw limited(cur.reset - now) }
  const start = Math.floor(now / windowMs) * windowMs
  let n: number | undefined
  try {
    n = (await db().query<{ hits: number }>('INSERT INTO core.rate_hits (key, window_start, hits) VALUES ($1, $2, 1) ON CONFLICT (key, window_start) DO UPDATE SET hits = core.rate_hits.hits + 1 RETURNING hits', [key.slice(0, 300), new Date(start).toISOString()])).rows[0]?.hits
    if (Math.random() < 0.005) void db().query("DELETE FROM core.rate_hits WHERE window_start < now() - interval '2 days'").catch(() => {})
  } catch { return }
  if (n && n > max) throw limited(start + windowMs - now)
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
