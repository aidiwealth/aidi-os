// Accounts that come in by statement or linked sheet, with their latest balance and statements (the company at the
// top, or every company on the group view), and the cash in live accounts in the same currency, so Banking can show
// one total for every account.
import { isDebt } from '~/shared/bank'
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin', 'gp')
  const sc = await forecastScope(event), up = await uploadedAccounts(sc)
  let live = 0, liveAt: string | null = null
  if (sc.group || !(await nigerianBanking(sc.entity))) {
    const rate = await rateTo(sc.currency)
    const rows = (await db().query<{ type: string | null; subtype: string | null; currency: string; current: string | null; updated_at: string }>(
      'SELECT a.type, a.subtype, a.currency, a.current::text, a.updated_at::text AS updated_at FROM banking.plaid_accounts a JOIN banking.plaid_items i ON i.id = a.item_id WHERE i.wm_client_id IS NULL')).rows
    for (const a of rows) if (a.current !== null && !isDebt(a)) { const k = await rate(a.currency); if (!Number.isFinite(k)) continue; live += Number(a.current) * k; if (!liveAt || a.updated_at > liveAt) liveAt = a.updated_at }
  }
  const asOf = [liveAt?.slice(0, 10) ?? null, ...up.accounts.map((a) => a.as_of)].filter(Boolean).sort().pop() ?? null
  return { ...up, live_total: Math.round(live * 100) / 100, all_total: Math.round((live + up.total) * 100) / 100, as_of: asOf }
})
