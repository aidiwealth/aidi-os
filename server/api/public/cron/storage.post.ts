// Renew storage packs that are due (wallet debit); lapse those that cannot be paid.
import { timingSafeEqual } from 'node:crypto'
export default defineEventHandler(async (event) => {
  const secret = useRuntimeConfig().cronSecret, given = getRequestHeader(event, 'x-cron-secret') ?? ''
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) throw apiError('forbidden', 'Forbidden', 403)
  const due = (await asPlatform(() => db().query<{ id: string; organization_id: string; gb: number; price_minor: string; auto_renew: boolean }>("SELECT id, organization_id, gb, price_minor::text, auto_renew FROM core.storage_addons WHERE status = 'active' AND expires_at <= now() LIMIT 200"))).rows
  let renewed = 0, lapsed = 0
  for (const a of due) {
    if (a.auto_renew && Number(a.price_minor) > 0) { try { await postLedger(a.organization_id, 'debit', Number(a.price_minor), 'subscription', 'Storage +' + a.gb + ' GB renewal (30 days)'); await asPlatform(() => db().query("UPDATE core.storage_addons SET expires_at = expires_at + interval '30 days' WHERE id = $1", [a.id])); renewed++; continue } catch { /* not enough in the wallet */ } }
    await asPlatform(() => db().query("UPDATE core.storage_addons SET status = 'lapsed' WHERE id = $1", [a.id])); lapsed++
  }
  return { renewed, lapsed }
})
