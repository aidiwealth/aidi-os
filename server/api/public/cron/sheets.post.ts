// Daily: re-reads every linked sheet (Financials, forecasts and customer revenue) in every live workspace. Called by the scheduled
// GitHub Action with the shared secret.
import { timingSafeEqual } from 'node:crypto'
export default defineEventHandler(async (event) => {
  const secret = useRuntimeConfig().cronSecret
  const given = getRequestHeader(event, 'x-cron-secret') ?? ''
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) throw apiError('forbidden', 'Forbidden', 403)
  let synced = 0, failed = 0
  for (const org of await liveOrgs()) {
    setOrgContext(org.id)
    const links = (await db().query<LinkRow>(`SELECT ${LINK_COLS} FROM financials.sheet_links WHERE auto ORDER BY last_synced_at NULLS FIRST LIMIT 50`).catch(() => ({ rows: [] as LinkRow[] }))).rows
    for (const l of links) { try { await syncLink(l, null); synced++ } catch { failed++ } }
    // Customer revenue from a linked sheet (Revenue retention and Customers).
    const cl = (await db().query<{ n: number }>("SELECT count(*)::int AS n FROM financials.customer_config WHERE link_url IS NOT NULL AND link_auto").catch(() => ({ rows: [{ n: 0 }] }))).rows[0]!.n
    if (cl) { try { await syncCustomerLink(); synced++ } catch { failed++ } }
  }
  return { ok: true, synced, failed }
})
