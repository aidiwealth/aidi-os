// Every few hours: for each live company, pull the bank feed and balances, re-read linked bank sheets (their
// changes wait for the founder to accept), and tidy categories (own companies and card bills are transfers). Pages then
// open on fresh data without waiting for banks. Called by the scheduled GitHub Action with the shared secret.
import { timingSafeEqual } from 'node:crypto'
export default defineEventHandler(async (event) => {
  const secret = useRuntimeConfig().cronSecret
  const given = getRequestHeader(event, 'x-cron-secret') ?? ''
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) throw apiError('forbidden', 'Forbidden', 403)
  let orgs = 0, added = 0, failed = 0
  const webhook = getRequestURL(event).origin + '/api/public/webhooks/plaid'
  for (const org of await liveOrgs()) {
    setOrgContext(org.id)
    if ((await currentOrg())?.kind !== 'company') continue
    orgs++
    try {
      // Older connections are pointed at this site's notices once; then the incremental sync catches anything missed.
      await ensureWebhook(webhook)
      added += await syncBankFeed()
      if (plaidOn()) for (const it of (await db().query<{ id: string; access_token_enc: string }>("SELECT id, access_token_enc FROM banking.plaid_items WHERE wm_client_id IS NULL AND error IS NULL")).rows) await refreshItem(it.id, it.access_token_enc).catch(() => {})
      await syncDue('bank_txns').catch(() => {})
      await fixOwnTransfers(); await fixCardPayments(); await pairTransfers(); await aiCategorize().catch(() => null)
    } catch (e) { failed++; console.error('[cron banking]', org.id, (e as Error).message) }
  }
  return { ok: true, orgs, added, failed }
})
