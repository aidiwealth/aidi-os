// Email delivery events from the email service (Resend, signed with Svix): marks each investor update email delivered,
// delayed, bounced or complained-about. Set NUXT_RESEND_WEBHOOK_SECRET (the "whsec_…" signing secret) and point the
// service's webhook at /api/public/webhooks/resend.
import { createHmac, timingSafeEqual } from 'node:crypto'
const MAP: Record<string, string> = { 'email.delivered': 'delivered', 'email.delivery_delayed': 'delayed', 'email.bounced': 'bounced', 'email.complained': 'complained', 'email.failed': 'failed' }
export default defineEventHandler(async (event) => {
  const secret = String(useRuntimeConfig().resendWebhookSecret ?? '')
  if (!secret.startsWith('whsec_')) throw apiError('not_configured', 'Not configured', 503)
  const raw = (await readRawBody(event)) ?? ''
  const id = getRequestHeader(event, 'svix-id') ?? '', ts = getRequestHeader(event, 'svix-timestamp') ?? '', sigs = getRequestHeader(event, 'svix-signature') ?? ''
  if (!id || !/^\d+$/.test(ts) || Math.abs(Date.now() / 1000 - Number(ts)) > 300) throw apiError('forbidden', 'Forbidden', 403)
  const expected = createHmac('sha256', Buffer.from(secret.slice(6), 'base64')).update(id + '.' + ts + '.' + raw).digest()
  const ok = sigs.split(' ').some((s) => { const b = Buffer.from(s.split(',')[1] ?? '', 'base64'); return b.length === expected.length && timingSafeEqual(b, expected) })
  if (!ok) throw apiError('forbidden', 'Forbidden', 403)
  const ev = JSON.parse(raw) as { type?: string; data?: { email_id?: string } }
  const state = MAP[ev.type ?? ''], eid = ev.data?.email_id
  if (state && eid && /^[A-Za-z0-9-]{8,80}$/.test(eid)) {
    // Delivered never overwrites a bounce or complaint that came first; those always win.
    await asPlatform(() => db().query("UPDATE financials.update_sends SET delivery = $2, delivery_at = now() WHERE email_id = $1 AND (delivery IS NULL OR delivery IN ('sent', 'delayed') OR $2 IN ('bounced', 'complained', 'failed'))", [eid, state]))
  }
  return { ok: true }
})
