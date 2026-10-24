// Accounts that come in by statement or linked sheet, with their latest balance and statements (the company at the
// top, or every company on the group view), and the cash in live accounts in the same currency, so Banking can show
// one total for every account and where it sits: by company on the group view, live against statements for a
// company with both, otherwise by account.
import { isDebt } from '~/shared/bank'
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin', 'gp')
  const sc = await forecastScope(event), up = await uploadedAccounts(sc), rate = await rateTo(sc.currency), main = await companyEntityId()
  const names = new Map(sc.companies.map((c) => [c.id, c.name]))
  let live = 0, liveAt: string | null = null
  const liveBy = new Map<string, number>(), liveAcc: { label: string; v: number }[] = []
  if (sc.group || !(await nigerianBanking(sc.entity))) {
    const rows = (await db().query<{ type: string | null; subtype: string | null; currency: string; current: string | null; updated_at: string; entity_id: string | null; label: string }>(
      "SELECT a.type, a.subtype, a.currency, a.current::text, a.updated_at::text AS updated_at, i.entity_id, coalesce(i.institution, 'Bank') || ' ' || a.name AS label FROM banking.plaid_accounts a JOIN banking.plaid_items i ON i.id = a.item_id WHERE i.wm_client_id IS NULL")).rows
    for (const a of rows) if (a.current !== null && !isDebt(a)) {
      const k = await rate(a.currency); if (!Number.isFinite(k)) continue
      const v = Number(a.current) * k, e = a.entity_id ?? main ?? ''
      live += v; liveBy.set(e, (liveBy.get(e) ?? 0) + v); liveAcc.push({ label: a.label, v })
      if (!liveAt || a.updated_at > liveAt) liveAt = a.updated_at
    }
  }
  const upAcc: { label: string; v: number; e: string }[] = []
  for (const a of up.accounts) if (a.balance) upAcc.push({ label: a.label, v: a.balance * await rate(a.currency), e: a.entity_id ?? main ?? '' })
  // Where the cash sits, largest first, at most five parts (the rest together).
  const top = (xs: { label: string; v: number }[]) => { const s = xs.filter((x) => x.v > 0).sort((a, b) => b.v - a.v); return s.length > 5 ? [...s.slice(0, 4), { label: s.length - 4 + ' more', v: s.slice(4).reduce((t, x) => t + x.v, 0) }] : s }
  let parts: { label: string; v: number }[]
  if (sc.group) {
    const by = new Map<string, number>(); for (const [e, v] of liveBy) by.set(e, (by.get(e) ?? 0) + v); for (const a of upAcc) by.set(a.e, (by.get(a.e) ?? 0) + a.v)
    parts = top([...by].map(([e, v]) => ({ label: names.get(e) ?? 'Other', v })))
  } else if (live > 0 && upAcc.length) parts = top([{ label: 'Live banks', v: live }, { label: 'Statements', v: up.total }])
  else parts = top([...liveAcc, ...upAcc])
  const asOf = [liveAt?.slice(0, 10) ?? null, ...up.accounts.map((a) => a.as_of)].filter(Boolean).sort().pop() ?? null
  return { ...up, live_total: Math.round(live * 100) / 100, all_total: Math.round((live + up.total) * 100) / 100, as_of: asOf, parts: parts.map((p) => ({ label: p.label, value: Math.round(p.v * 100) / 100 })) }
})
