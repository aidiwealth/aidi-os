// Authenticator-app codes (TOTP, RFC 6238: 30-second steps, 6 digits, SHA-1), recovery codes, and the short-lived
// ticket that carries a sign-in from the email step to the app-code step.
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
export function b32encode(buf: Buffer): string { let bits = 0, v = 0, out = ''; for (const b of buf) { v = (v << 8) | b; bits += 8; while (bits >= 5) { out += B32[(v >>> (bits - 5)) & 31]; bits -= 5 } } if (bits > 0) out += B32[(v << (5 - bits)) & 31]; return out }
function b32decode(s: string): Buffer { const c = s.replace(/=+$/, '').toUpperCase().replace(/[^A-Z2-7]/g, ''); let bits = 0, v = 0; const out: number[] = []; for (const ch of c) { v = (v << 5) | B32.indexOf(ch); bits += 5; if (bits >= 8) { out.push((v >>> (bits - 8)) & 255); bits -= 8 } } return Buffer.from(out) }
function hotp(secret: Buffer, counter: number): string {
  const msg = Buffer.alloc(8); msg.writeUInt32BE(Math.floor(counter / 2 ** 32), 0); msg.writeUInt32BE(counter >>> 0, 4)
  const h = createHmac('sha1', secret).update(msg).digest(); const o = h[h.length - 1]! & 15
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000)).padStart(6, '0')
}
export const newSecret = () => b32encode(randomBytes(20))
export function otpauthUri(secret: string, email: string, issuer: string) { return 'otpauth://totp/' + encodeURIComponent(issuer + ':' + email) + '?secret=' + secret + '&issuer=' + encodeURIComponent(issuer) + '&algorithm=SHA1&digits=6&period=30' }
// Accepts the current step and one either side; returns the step used (to stop the same code being reused).
export function checkTotp(secret: string, code: string, lastStep = 0): number | null {
  if (!/^\d{6}$/.test(code)) return null
  const key = b32decode(secret), now = Math.floor(Date.now() / 30000)
  for (const s of [now, now - 1, now + 1]) { if (s <= lastStep) continue; const c = hotp(key, s); if (timingSafeEqual(Buffer.from(c), Buffer.from(code))) return s }
  return null
}
const hash = (c: string) => createHash('sha256').update(c.replace(/[^A-Za-z0-9]/g, '').toUpperCase()).digest('hex')
export function newRecoveryCodes(): { codes: string[]; hashes: string[] } { const codes = Array.from({ length: 10 }, () => { const r = b32encode(randomBytes(6)).slice(0, 10); return r.slice(0, 5) + '-' + r.slice(5) }); return { codes, hashes: codes.map(hash) } }
export async function mfaRow(userId: string) { return (await db().query<{ secret_enc: string; enabled_at: string | null; recovery_hashes: string[]; last_step: string }>('SELECT secret_enc, enabled_at, recovery_hashes, last_step::text FROM core.user_mfa WHERE user_id = $1', [userId])).rows[0] ?? null }
// Verify an app code or a recovery code for a user with two-step on; records use so codes cannot be replayed.
export async function verifySecondFactor(userId: string, code: string): Promise<boolean> {
  const r = await mfaRow(userId); if (!r?.enabled_at) return false
  const c = code.trim()
  if (/^\d{6}$/.test(c)) { const s = checkTotp(decryptText(r.secret_enc), c, Number(r.last_step)); if (s === null) return false; await db().query('UPDATE core.user_mfa SET last_step = $2, updated_at = now() WHERE user_id = $1', [userId, s]); return true }
  const h = hash(c); if (!r.recovery_hashes.includes(h)) return false
  await db().query('UPDATE core.user_mfa SET recovery_hashes = array_remove(recovery_hashes, $2), updated_at = now() WHERE user_id = $1', [userId, h]); return true
}
// After the email step: if this person has two-step on, return a 10-minute ticket instead of signing them in.
export async function mfaTicketFor(email: string): Promise<string | null> {
  const u = (await db().query<{ id: string }>("SELECT u.id FROM core.users u JOIN core.user_mfa m ON m.user_id = u.id WHERE u.email = $1 AND u.status = 'active' AND m.enabled_at IS NOT NULL", [email])).rows[0]
  if (!u) return null
  const p = Buffer.from(JSON.stringify({ e: email, u: u.id, x: Date.now() + 600_000 })).toString('base64url')
  return p + '.' + createHmac('sha256', useRuntimeConfig().jwtSecret).update('mfa:' + p).digest('base64url').slice(0, 32)
}
export function readMfaTicket(t: string): { e: string; u: string } | null {
  const [p, sig] = t.split('.'); if (!p || !sig) return null
  const want = createHmac('sha256', useRuntimeConfig().jwtSecret).update('mfa:' + p).digest('base64url').slice(0, 32)
  if (sig.length !== want.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null
  const o = JSON.parse(Buffer.from(p, 'base64url').toString('utf8')) as { e: string; u: string; x: number }
  return o.x > Date.now() ? o : null
}
