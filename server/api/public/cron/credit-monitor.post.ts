// Daily: re-check monitored Nigerian borrowers whose last check is over 30 days old (at most 50 a run).
import { timingSafeEqual } from 'node:crypto'
export default defineEventHandler(async (event) => {
  const secret = useRuntimeConfig().cronSecret, given = getRequestHeader(event, 'x-cron-secret') ?? ''
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) throw apiError('forbidden', 'Forbidden', 403)
  const due = (await asPlatform(() => db().query<{ id: string; organization_id: string; kind: 'individual' | 'business'; identifier_enc: string }>(
    "SELECT b.id, b.organization_id, b.kind, b.identifier_enc FROM credit.borrowers b WHERE b.monitor AND b.identifier_enc IS NOT NULL AND b.country ILIKE 'nigeria' AND coalesce((SELECT max(c.created_at) FROM credit.checks c WHERE c.borrower_id = b.id), 'epoch') < now() - interval '30 days' LIMIT 50"))).rows
  let done = 0
  for (const b of due) {
    try { const r = await creditchek(b.kind, decryptText(b.identifier_enc)); const sc = r.summary ? scoreOf(r.summary) : null
      await asPlatform(() => db().query("INSERT INTO credit.checks (organization_id, borrower_id, provider, kind, status, score, band, summary, note) VALUES ($1,$2,'creditchek',$3,$4,$5,$6,$7,'Monthly monitoring')", [b.organization_id, b.id, b.kind, r.status, sc?.score ?? null, sc?.band ?? null, JSON.stringify(r.summary ?? {})])); done++ }
    catch (err) { console.error('[credit-monitor]', err) }
  }
  return { due: due.length, done }
})
