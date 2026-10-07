// Busha events (trades and transfers). Logged; a completed or failed trade updates the matching holding's status note.
// If NUXT_BUSHA_WEBHOOK_SECRET is set, the HMAC-SHA256 signature of the raw body must match.
import { createHmac, timingSafeEqual } from 'node:crypto'
export default defineEventHandler(async (event) => {
  const raw = (await readRawBody(event, 'utf8')) ?? ''
  let body: { event?: string; type?: string; data?: Record<string, any> } = {}
  try { body = JSON.parse(raw) } catch { throw apiError('invalid', 'Bad payload', 400) }
  const secret = (useRuntimeConfig() as unknown as Record<string, string>).bushaWebhookSecret
  const sig = getRequestHeader(event, 'x-bu-signature') ?? getRequestHeader(event, 'x-busha-signature') ?? getRequestHeader(event, 'signature') ?? ''
  let verified = !secret
  if (secret && sig) { const h = createHmac('sha256', secret).update(raw).digest('hex'); verified = h.length === sig.length && timingSafeEqual(Buffer.from(h), Buffer.from(sig)) }
  const ref = body.data?.id ?? body.data?.reference ?? null, ev = body.event ?? body.type ?? null
  await asPlatform(() => db().query('INSERT INTO wm.provider_events (provider, event, reference, payload, verified) VALUES ($1,$2,$3,$4,$5)', ['busha', ev, ref, raw.slice(0, 20000), verified]))
  if (!verified) throw apiError('forbidden', 'Bad signature', 401)
  if (ref && body.data?.status) await asPlatform(() => db().query("UPDATE wealth.holdings SET meta = meta || jsonb_build_object('busha_status', $2::text), updated_at = now() WHERE meta->>'busha_ref' = $1", [String(ref), String(body.data!.status)]))
  return { ok: true }
})
