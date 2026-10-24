// Reconciling Banking with Financials, month by month, the way an accountant would without a transaction-level ledger:
// the bank's month-end cash against the cash line on the balance sheet (the exact check), customer receipts against
// revenue and spend by line against the P&L (these differ by timing: invoices not yet paid, bills paid later), and
// how many of the company's accounts the bank side covers. A month can then be marked reconciled, with a note.
import { deriveLines, type Lines } from '~/shared/fin-view'
import { isDebt } from '~/shared/bank'

// Balances on a day for an account (statement closing, running balance, a sheet's balance column, the live feed):
// one per month (the last day seen) plus the closing balance, kept for working out month ends.
export async function saveBalances(entityId: string | null, account: string, currency: string, source: 'statement' | 'sheet' | 'bank_feed', points: { date: string; balance: number | null }[]) {
  const last = new Map<string, { date: string; balance: number }>()
  for (const p of points) { if (p.balance === null || !Number.isFinite(p.balance) || !p.date) continue; const m = p.date.slice(0, 7), ex = last.get(m); if (!ex || p.date >= ex.date) last.set(m, { date: p.date, balance: p.balance }) }
  for (const v of last.values()) await db().query(`INSERT INTO banking.balances (entity_id, account_label, as_of, balance, currency, source) VALUES ($1,$2,$3,$4,$5,$6)
    ON CONFLICT (organization_id, account_label, as_of) DO UPDATE SET balance = EXCLUDED.balance, entity_id = EXCLUDED.entity_id, currency = EXCLUDED.currency, source = EXCLUDED.source, updated_at = now()`, [entityId, account.slice(0, 160), v.date, Math.round(v.balance * 100) / 100, currency, source])
  return last.size
}

// Live feed accounts: today's balance, under the same account name the feed's transactions use.
async function feedAnchors() {
  const rows = (await db().query<{ institution: string | null; name: string; mask: string | null; currency: string; current: string | null; updated_at: string; entity_id: string | null; type: string | null; subtype: string | null }>(
    "SELECT i.institution, a.name, a.mask, a.currency, a.current::text, a.updated_at::date::text AS updated_at, i.entity_id, a.type, a.subtype FROM banking.plaid_accounts a JOIN banking.plaid_items i ON i.id = a.item_id WHERE i.wm_client_id IS NULL").catch(() => ({ rows: [] }))).rows
  return rows.filter((a) => a.current !== null && !isDebt(a))
    .map((a) => ({ account_label: (a.institution ?? 'Bank') + ' · ' + a.name + (a.mask ? ' ··' + a.mask : ''), as_of: a.updated_at, balance: Number(a.current), currency: a.currency, entity_id: a.entity_id }))
}

const LINE_OF = (cat: string | null) => { const c = cat ?? 'opex_other', m = /^cat:([a-z_]+):/.exec(c); return m ? m[1]! : c }
const SPEND_LINES: [string, string][] = [['cogs', 'Cost of revenue'], ['opex_payroll', 'Payroll'], ['opex_marketing', 'Sales & marketing'], ['opex_rnd', 'Product & engineering'], ['opex_ga', 'General & admin'], ['opex_other', 'Other operating costs'], ['tax', 'Tax'], ['interest', 'Interest']]
const close = (a: number, b: number, rel: number, abs: number) => Math.abs(a - b) <= Math.max(abs, Math.abs(b) * rel)

export async function reconView(sc: { group: boolean; entity: string | null; currency: string }, monthsBack = 12) {
  const cur = sc.currency, rate = await rateTo(cur), main = await companyEntityId(), ent = sc.group ? null : sc.entity
  const scope = sc.group ? 'group' : ent ?? 'group', subject = sc.group ? 'group' : ent ? 'entity:' + ent : 'group'
  const inScope = (e: string | null) => ent === null || (e ?? main) === ent
  // Financials: cash and the P&L lines per month.
  const fin = new Map<string, Record<string, number | null>>()
  for (const r of (await loadStatements(subject, 'month', cur).catch(() => [])).filter((r) => r.period_type === 'month')) fin.set(String(r.period_end).slice(0, 7), deriveLines(r.lines as Lines, 1))
  // The bank: money in and out by month and category, and each account's flows by day (to walk balances).
  const led = (await db().query<{ entity_id: string | null; account_label: string | null; d: string; direction: string; category: string | null; currency: string; amount: string }>(
    "SELECT entity_id, account_label, txn_date::text AS d, direction, category, currency, sum(amount)::text AS amount FROM banking.ledger WHERE txn_date >= date_trunc('month', now()) - interval '25 months' GROUP BY 1, 2, 3, 4, 5, 6")).rows.filter((r) => inScope(r.entity_id))
  const thisM = new Date().toISOString().slice(0, 7)
  const months = Array.from({ length: monthsBack }, (_, i) => { const d = new Date(thisM + '-15T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() - monthsBack + i); return d.toISOString().slice(0, 7) })
  const byM: Record<string, { receipts: number; financing: number; other_in: number; out: Record<string, number>; transfers: number }> = {}
  const flows = new Map<string, { d: string; v: number }[]>(), acctCur = new Map<string, string>(), acctEnt = new Map<string, string | null>()
  for (const r of led) {
    const m = r.d.slice(0, 7), a = Number(r.amount), k = await rate(r.currency), x = (byM[m] ??= { receipts: 0, financing: 0, other_in: 0, out: {}, transfers: 0 }), line = LINE_OF(r.category)
    if (line === 'transfer' || line === 'investment') x.transfers += a * k
    else if (r.direction === 'in') { if (line === 'revenue') x.receipts += a * k; else if (line === 'financing') x.financing += a * k; else x.other_in += a * k }
    else x.out[line] = (x.out[line] ?? 0) + a * k
    const acc = r.account_label ?? 'Account'; acctCur.set(acc, r.currency); acctEnt.set(acc, r.entity_id)
    ;(flows.get(acc) ?? flows.set(acc, []).get(acc)!).push({ d: r.d, v: r.direction === 'in' ? a : -a })
  }
  // Balances: saved points plus the live feed's today, for the accounts in scope.
  const anchors = new Map<string, { as_of: string; balance: number; currency: string }[]>()
  const saved = (await db().query<{ entity_id: string | null; account_label: string; as_of: string; balance: string; currency: string }>('SELECT entity_id, account_label, as_of::text, balance::text, currency FROM banking.balances')).rows
  for (const b of [...saved.map((s) => ({ ...s, balance: Number(s.balance) })), ...(await feedAnchors())]) {
    if (!inScope(b.entity_id)) continue
    ;(anchors.get(b.account_label) ?? anchors.set(b.account_label, []).get(b.account_label)!).push({ as_of: b.as_of, balance: b.balance, currency: b.currency })
    if (!acctCur.has(b.account_label)) { acctCur.set(b.account_label, b.currency); acctEnt.set(b.account_label, b.entity_id) }
  }
  // An account's balance at the end of a month: from the nearest known balance, adding or taking away the transactions
  // between. Only when the transactions cover the gap (the known balance is within the months the ledger has).
  const endOf = (m: string) => { const d = new Date(m + '-01T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(0); return d.toISOString().slice(0, 10) }
  const balAt = (acc: string, day: string): number | null => {
    const as = anchors.get(acc); if (!as?.length) return null
    const fl = flows.get(acc) ?? [], first = fl.reduce((m, f) => (f.d < m ? f.d : m), '9999'), lastD = fl.reduce((m, f) => (f.d > m ? f.d : m), '0000')
    const after = as.filter((a) => a.as_of >= day).sort((a, b) => a.as_of.localeCompare(b.as_of))[0], before = as.filter((a) => a.as_of < day).sort((a, b) => b.as_of.localeCompare(a.as_of))[0]
    if (after && (after.as_of === day || (fl.length > 0 && day >= first))) return after.balance - fl.filter((f) => f.d > day && f.d <= after.as_of).reduce((s, f) => s + f.v, 0)
    if (before && (day <= lastD || before.as_of.slice(0, 7) === day.slice(0, 7))) return before.balance + fl.filter((f) => f.d > before.as_of && f.d <= day).reduce((s, f) => s + f.v, 0)
    return null
  }
  // Cards and loans owe money; they are not cash, so month-end cash is the bank accounts only.
  const debts = await debtLabels()
  const accounts = [...acctCur.keys()].filter((a) => inScope(acctEnt.get(a) ?? null) && !debts.has(a))
  const rec = new Map((await db().query<{ month: string; note: string | null; at: string; by: string | null; gap: string | null }>("SELECT r.month, r.note, r.at::text, u.email AS by, r.gap::text FROM banking.reconciled r LEFT JOIN core.users u ON u.id = r.by_user WHERE r.scope = $1", [scope])).rows.map((r) => [r.month, r]))
  const rows = []
  for (const m of months) {
    const f = fin.get(m) ?? null, b = byM[m] ?? null, day = endOf(m)
    let cash: number | null = null, covered = 0
    for (const a of accounts) { const v = balAt(a, day); if (v !== null) { cash = (cash ?? 0) + v * await rate(acctCur.get(a)!); covered++ } }
    const finCash = f ? f.cash ?? null : null
    const spend = SPEND_LINES.map(([k, label]) => ({ key: k, label, bank: Math.round(b?.out[k] ?? 0), fin: f ? Math.round(Math.abs(f[k] ?? 0)) : null })).filter((x) => x.bank || x.fin)
    const bankOut = Object.values(b?.out ?? {}).reduce((s, v) => s + v, 0), finCosts = spend.reduce((s, x) => s + (x.fin ?? 0), 0)
    const cashOk = cash !== null && finCash !== null && close(cash, finCash, 0.005, 1)
    const status = !f ? 'no_financials' : !b && cash === null ? 'no_bank' : cash === null ? 'no_balance' : covered < accounts.length ? 'partial' : cashOk ? 'matches' : 'gap'
    const r = rec.get(m)
    rows.push({ month: m, status, cash: { bank: cash === null ? null : Math.round(cash), fin: finCash === null ? null : Math.round(finCash), gap: cash !== null && finCash !== null ? Math.round(cash - finCash) : null, accounts: covered, of: accounts.length },
      receipts: { bank: Math.round(b?.receipts ?? 0), fin: f ? Math.round(f.revenue ?? 0) : null, ok: f ? close(b?.receipts ?? 0, f.revenue ?? 0, 0.1, 100) : null },
      spend, spend_total: { bank: Math.round(bankOut), fin: f ? Math.round(finCosts) : null, ok: f ? close(bankOut, finCosts, 0.1, 100) : null },
      other: { financing: Math.round(b?.financing ?? 0), other_in: Math.round(b?.other_in ?? 0), transfers: Math.round(b?.transfers ?? 0) },
      reconciled: r ? { note: r.note, at: r.at, by: r.by, gap: r.gap === null ? null : Number(r.gap) } : null })
  }
  return { currency: cur, scope, accounts: accounts.map((a) => ({ name: a, currency: acctCur.get(a)!, balances: (anchors.get(a) ?? []).length, live: (anchors.get(a) ?? []).length > 0 })), rows: rows.filter((r) => !(r.status === 'no_financials' && r.cash.bank === null && !r.receipts.bank && !r.spend_total.bank)).reverse() }
}
