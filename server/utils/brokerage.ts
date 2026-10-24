// Brokerage and investment accounts (banking.account_settings kind 'brokerage'): their month-end valuations (cash +
// holdings at market value = total), checked against the cash from their transactions, and their payments put under
// the right lines. Buying a security, or one maturing or being sold, only moves money between cash and holdings
// ("investment": neither revenue nor spend); interest is other income; the advisor's fee is a cost; money to or from
// the company's own bank is a transfer.
const RULES: [RegExp, string][] = [
  [/^\s*(bought|buy\b|purchase|reinvest)/i, 'investment'],
  [/^\s*(full redemption|partial redemption|redemption|redeemed|cd maturity|maturity|matured|sale\b|sold|called)/i, 'investment'],
  [/\b(advisor(y)? fee|management fee|custody fee)\b/i, 'opex_ga'],
  [/\b(interest|dividend|coupon)\b/i, 'other_income'],
  [/\b(moneylink|funds paid|withdrawal|deposit|wire|journal|transfer)\b/i, 'transfer']]
export function brokerageCategory(desc: string): string | null { for (const [re, c] of RULES) if (re.test(desc)) return c; return null }

export interface Valuation { month_end: string; cash: number; holdings: number; total: number; accrued: number | null }
// A month-end valuation file (the Finvry template or a similar export): month end, cash, holdings at market value,
// total account value, accrued interest (optional). Columns found by their headings; totals including accrued interest
// are not the total.
export function parseValuations(rows: string[][]): Valuation[] {
  const hi = rows.findIndex((r) => r.some((c) => /month|date|period/i.test(c)) && r.some((c) => /cash/i.test(c)))
  if (hi < 0) throw new Error('header')
  const h = rows[hi]!.map((c) => c.toLowerCase())
  const col = (ok: (c: string) => boolean) => h.findIndex(ok)
  const ci = { m: col((c) => /month|date|period/.test(c)), cash: col((c) => /cash/.test(c) && !/total/.test(c)), hold: col((c) => /holding|market value|securit|fixed income|treasur|investment|position/.test(c) && !/total/.test(c)),
    total: col((c) => /total/.test(c) && !/accrued|interest/.test(c)), acc: col((c) => /accrued/.test(c) && !/total|incl/.test(c)) }
  if (ci.m < 0 || ci.cash < 0 || (ci.hold < 0 && ci.total < 0)) throw new Error('header')
  const num = (s: string | undefined) => { const t = (s ?? '').replace(/[\s,$₦£€]|USD|NGN/gi, ''); if (!t) return null; const neg = /^\(.*\)$/.test(t) || t.startsWith('-'); const n = Number(t.replace(/[()-]/g, '')); return Number.isFinite(n) ? (neg ? -n : n) : null }
  const out: Valuation[] = []
  for (const r of rows.slice(hi + 1)) {
    if (r.some((c) => /\(delete this row\)/i.test(c))) continue
    const raw = (r[ci.m] ?? '').trim(), serial = /^\d{5}$/.test(raw) ? new Date(Date.UTC(1899, 11, 30) + Number(raw) * 86400000).toISOString().slice(0, 10) : null
    const iso = serial ?? (/^\d{4}-\d{2}(-\d{2})?$/.test(raw) ? raw : !isNaN(Date.parse(raw)) ? new Date(Date.parse(raw) - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10) : null)
    if (!iso) continue
    // The last day of that month, whatever day was written.
    const d = new Date(iso.slice(0, 7) + '-01T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(0)
    const cash = num(r[ci.cash]); if (cash === null) continue
    const hold = ci.hold >= 0 ? num(r[ci.hold]) : null, total = ci.total >= 0 ? num(r[ci.total]) : null
    const holdings = hold ?? (total !== null ? Math.round((total - cash) * 100) / 100 : 0)
    out.push({ month_end: d.toISOString().slice(0, 10), cash, holdings, total: total ?? Math.round((cash + holdings) * 100) / 100, accrued: ci.acc >= 0 ? num(r[ci.acc]) : null })
  }
  if (!out.length) throw new Error('empty')
  return out.sort((a, b) => a.month_end.localeCompare(b.month_end))
}

export async function markBrokerage(entity: string, label: string, currency: string) {
  await db().query(`INSERT INTO banking.account_settings (entity_id, account_label, kind, currency) VALUES ($1,$2,'brokerage',$3)
    ON CONFLICT (organization_id, entity_id, account_label) DO UPDATE SET kind = 'brokerage', currency = EXCLUDED.currency, updated_at = now()`, [entity, label, currency])
}
export async function saveValuations(entity: string, label: string, currency: string, vals: Valuation[]) {
  for (const v of vals) await db().query(`INSERT INTO banking.valuations (entity_id, account_label, month_end, currency, cash, holdings, total, accrued) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    ON CONFLICT (organization_id, entity_id, account_label, month_end) DO UPDATE SET cash = EXCLUDED.cash, holdings = EXCLUDED.holdings, total = EXCLUDED.total, accrued = EXCLUDED.accrued, currency = EXCLUDED.currency, created_at = now()`,
  [entity, label, v.month_end, currency, v.cash, v.holdings, v.total, v.accrued])
}

// Payments in brokerage accounts still on an automatic category: put under investment, interest, fee or transfer.
export async function fixBrokerage(): Promise<number> {
  const rows = (await db().query<{ id: string; description: string; category: string | null }>(`SELECT l.id, l.description, l.category FROM banking.ledger l
      JOIN banking.account_settings s ON s.organization_id = l.organization_id AND s.kind = 'brokerage' AND s.account_label = l.account_label AND s.entity_id = coalesce(l.entity_id, s.entity_id)
     WHERE l.category_by IN ('auto', 'ai')`)).rows
  let n = 0
  for (const r of rows) { const c = brokerageCategory(r.description); if (c && c !== r.category) { await db().query("UPDATE banking.ledger SET category = $2, category_by = 'auto' WHERE id = $1", [r.id, c]); n++ } }
  return n
}

// Each month's check: the cash from transactions (the month-end balance a statement gave) against the valuation's cash,
// and cash + holdings against the total. More than 1 off is flagged.
export async function valuationCheck(entity: string, label: string): Promise<{ months: number; off: { month: string; why: string }[] }> {
  const v = (await db().query<{ m: string; cash: number; holdings: number; total: number }>("SELECT to_char(month_end, 'YYYY-MM') AS m, cash::float, holdings::float, total::float FROM banking.valuations WHERE entity_id = $1 AND account_label = $2 ORDER BY month_end", [entity, label])).rows
  const bal = new Map((await db().query<{ m: string; balance: number }>(`SELECT DISTINCT ON (to_char(as_of, 'YYYY-MM')) to_char(as_of, 'YYYY-MM') AS m, balance::float FROM banking.balances
      WHERE coalesce(entity_id, $1::uuid) = $1 AND account_label = $2 AND source IN ('statement', 'sheet') ORDER BY to_char(as_of, 'YYYY-MM'), as_of DESC`, [entity, label])).rows.map((r) => [r.m, r.balance]))
  const txn = new Set((await db().query<{ m: string }>("SELECT DISTINCT to_char(txn_date, 'YYYY-MM') AS m FROM banking.ledger WHERE coalesce(entity_id, $1::uuid) = $1 AND account_label = $2 AND source = 'upload'", [entity, label])).rows.map((r) => r.m))
  const off: { month: string; why: string }[] = []
  for (const x of v) {
    if (Math.abs(x.cash + x.holdings - x.total) > 1) off.push({ month: x.m, why: 'cash plus holdings is ' + (x.cash + x.holdings - x.total).toFixed(2) + ' off the total' })
    const b = bal.get(x.m)
    if (txn.has(x.m) && b !== undefined && Math.abs(b - x.cash) > 1) off.push({ month: x.m, why: 'cash from transactions differs by ' + (b - x.cash).toFixed(2) })
  }
  return { months: v.length, off }
}
