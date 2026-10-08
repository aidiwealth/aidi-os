// Will this address receive our code? Catches common typos, throwaway domains and domains that accept no mail.
import { promises as dns } from 'node:dns'
const DISPOSABLE = new Set(['mailinator.com', 'guerrillamail.com', '10minutemail.com', 'tempmail.com', 'temp-mail.org', 'throwawaymail.com', 'yopmail.com', 'trashmail.com', 'sharklasers.com', 'getnada.com', 'dispostable.com', 'maildrop.cc', 'fakeinbox.com', 'mintemail.com', 'mohmal.com', 'emailondeck.com', 'tempail.com', 'burnermail.io'])
const TYPOS: Record<string, string> = { 'gmail.con': 'gmail.com', 'gmail.co': 'gmail.com', 'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gmail.cm': 'gmail.com', 'yahooo.com': 'yahoo.com', 'yahoo.con': 'yahoo.com', 'hotmial.com': 'hotmail.com', 'outlok.com': 'outlook.com', 'outlook.con': 'outlook.com', 'icloud.con': 'icloud.com' }
const cache = new Map<string, { ok: boolean; at: number }>()
export async function checkEmail(email: string): Promise<{ ok: boolean; message?: string }> {
  const domain = email.split('@')[1]?.toLowerCase().trim() ?? ''
  if (TYPOS[domain]) return { ok: false, message: 'Did you mean ' + email.split('@')[0] + '@' + TYPOS[domain] + '?' }
  if (DISPOSABLE.has(domain)) return { ok: false, message: 'Please use a permanent email address, not a temporary one.' }
  const hit = cache.get(domain); if (hit && Date.now() - hit.at < 3_600_000) return hit.ok ? { ok: true } : { ok: false, message: 'That email domain does not accept mail. Check the address.' }
  let ok = true
  try { const mx = await Promise.race([dns.resolveMx(domain), new Promise<never>((_, r) => setTimeout(() => r(new Error('timeout')), 2500))]); ok = Array.isArray(mx) && mx.length > 0 }
  catch (e) { const code = (e as { code?: string }).code; ok = !(code === 'ENOTFOUND' || code === 'ENODATA') } // on timeouts or DNS trouble, let it through
  cache.set(domain, { ok, at: Date.now() })
  return ok ? { ok: true } : { ok: false, message: 'That email domain does not accept mail. Check the address.' }
}
