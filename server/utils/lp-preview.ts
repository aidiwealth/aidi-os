// Short-lived, signed preview links so the fund team can see an LP's portal exactly as the LP does.
import { createHmac, timingSafeEqual } from 'node:crypto'
const key = () => 'lp-preview:' + useRuntimeConfig().jwtSecret
export function lpPreviewToken(lpId: string, minutes = 30): string {
  const body = Buffer.from(JSON.stringify({ lp: lpId, exp: Date.now() + minutes * 60000 })).toString('base64url')
  return 'pv.' + body + '.' + createHmac('sha256', key()).update(body).digest('base64url')
}
export function readLpPreview(token: string): string | null {
  const [, body, sig] = token.split('.')
  if (!body || !sig) return null
  const good = createHmac('sha256', key()).update(body).digest('base64url')
  if (sig.length !== good.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null
  try { const p = JSON.parse(Buffer.from(body, 'base64url').toString()) as { lp: string; exp: number }; return p.exp > Date.now() ? p.lp : null } catch { return null }
}
