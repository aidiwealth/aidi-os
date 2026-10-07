// Monthly: a subscription invoice for every active self-directed wealth client (online payment link by email).
import { timingSafeEqual } from 'node:crypto'
export default defineEventHandler(async (event) => {
  const secret = useRuntimeConfig().cronSecret, given = getRequestHeader(event, 'x-cron-secret') ?? ''
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) throw apiError('forbidden', 'Forbidden', 403)
  const period = new Date().toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })
  const due = (await asPlatform(() => db().query<{ id: string; organization_id: string; country: 'US' | 'NG'; entity_id: string | null }>(
    "SELECT c.id, c.organization_id, c.country, c.entity_id FROM wm.clients c WHERE c.model = 'self_directed' AND c.status = 'active' AND NOT EXISTS (SELECT 1 FROM wm.fees f WHERE f.client_id = c.id AND f.kind = 'subscription' AND f.period = $1)", [period]))).rows
  let issued = 0
  for (const c of due) {
    setOrgContext(c.organization_id)
    const cfg = (await wmSettings())[c.country]
    if (!cfg.self_directed || !cfg.subscription) continue
    const f = await one<{ id: string }>("INSERT INTO wm.fees (client_id, kind, period, amount, currency, entity_id, method) VALUES ($1,'subscription',$2,$3,$4,$5,'online') RETURNING id", [c.id, period, cfg.subscription, cfg.currency, c.entity_id])
    try { await issueFee(f.id); issued++ } catch (err) { console.error('[wm-billing]', err) }
  }
  return { period, issued }
})
