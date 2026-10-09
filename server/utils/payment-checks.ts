// Payment checks: every logged payment is cross-checked against the bank statements imported in Banking and the
// financial statements in Financials, and against its receipt. Anything that does not agree is flagged.
export type BankStatus = 'matched' | 'missing' | 'no_statement' | 'no_account'
export interface PaymentCheck { bank: BankStatus; bank_txn?: { date: string; description: string }; receipt: string | null; receipt_issues: string[] }
export interface ChecksResult {
  by_id: Record<string, PaymentCheck>
  unlogged: { date: string; account: string; description: string; amount: number; currency: string }[]
  financials: { entity: string; period: string; currency: string; logged: number; statement_costs: number; text: string }[]
  summary: { payments: number; bank_matched: number; bank_missing: number; bank_no_statement: number; receipt_mismatch: number; unlogged: number; financials: number }
}

const DAYS = 7
const fmt = (v: number, c: string) => { try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: c }).format(v) } catch { return c + ' ' + v.toFixed(2) } }
const dayDiff = (a: string, b: string) => Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 864e5

export async function paymentChecks(): Promise<ChecksResult> {
  const pays = (await db().query<{ id: string; paid_on: string; amount: number; currency: string; entity_id: string | null; bank_account_id: string | null; receipt_status: string | null; receipt_issues: string[] }>(
    "SELECT id, to_char(paid_on, 'YYYY-MM-DD') AS paid_on, amount::float AS amount, currency, entity_id, bank_account_id, receipt_status, receipt_issues FROM finance.expenses ORDER BY paid_on")).rows
  const deps = (await db().query<{ id: string; paid_on: string; amount: number; currency: string; entity_id: string | null; bank_account_id: string | null }>(
    "SELECT id, to_char(paid_on, 'YYYY-MM-DD') AS paid_on, amount::float AS amount, currency, paying_entity_id AS entity_id, bank_account_id FROM finance.deployments ORDER BY paid_on")).rows
  const accounts = (await db().query<{ id: string; entity_id: string; currency: string; name: string }>("SELECT id, entity_id, currency, bank_name || coalesce(' •••' || last4, '') AS name FROM banking.accounts")).rows
  const stmts = (await db().query<{ account_id: string; start: string; end: string }>("SELECT account_id, to_char(period_start, 'YYYY-MM-DD') AS start, to_char(period_end, 'YYYY-MM-DD') AS end FROM banking.statements")).rows
  const txns = (await db().query<{ id: string; account_id: string; date: string; description: string; amount: number }>(
    "SELECT id, account_id, to_char(txn_date, 'YYYY-MM-DD') AS date, description, amount::float AS amount FROM banking.transactions WHERE amount < 0 ORDER BY txn_date")).rows
  const used = new Set<string>()
  const candidates = (p: { entity_id: string | null; bank_account_id: string | null; currency: string }) =>
    p.bank_account_id ? accounts.filter((a) => a.id === p.bank_account_id) : accounts.filter((a) => a.entity_id === p.entity_id && a.currency === p.currency)
  const covered = (accIds: string[], date: string) => stmts.some((s) => accIds.includes(s.account_id) && s.start <= date && s.end >= date)
  function match(p: { paid_on: string; amount: number; entity_id: string | null; bank_account_id: string | null; currency: string }): { status: BankStatus; txn?: typeof txns[number] } {
    const accs = candidates(p).map((a) => a.id)
    if (!accs.length) return { status: 'no_account' }
    const t = txns.filter((x) => !used.has(x.id) && accs.includes(x.account_id) && Math.abs(-x.amount - p.amount) < 0.01 && dayDiff(x.date, p.paid_on) <= DAYS)
      .sort((a, b) => dayDiff(a.date, p.paid_on) - dayDiff(b.date, p.paid_on))[0]
    if (t) { used.add(t.id); return { status: 'matched', txn: t } }
    return { status: covered(accs, p.paid_on) ? 'missing' : 'no_statement' }
  }
  const by_id: Record<string, PaymentCheck> = {}
  for (const p of pays) {
    const m = match(p)
    by_id[p.id] = { bank: m.status, bank_txn: m.txn ? { date: m.txn.date, description: m.txn.description } : undefined, receipt: p.receipt_status, receipt_issues: p.receipt_issues ?? [] }
  }
  for (const d of deps) match(d) // deployments also explain money out of the bank
  // Money out of the bank in the last 12 months that no payment or deployment explains.
  const since = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10)
  const accName = new Map(accounts.map((a) => [a.id, a]))
  const unlogged = txns.filter((t) => !used.has(t.id) && t.date >= since).slice(-100).reverse()
    .map((t) => ({ date: t.date, account: accName.get(t.account_id)?.name ?? 'Bank account', description: t.description, amount: -t.amount, currency: accName.get(t.account_id)?.currency ?? 'USD' }))
  // Payments logged for a period must not exceed the costs in that period's financial statements.
  const fs = (await db().query<{ entity_id: string; entity: string; period_type: string; period_end: string; currency: string; lines: Record<string, number | null> }>(
    "SELECT s.entity_id, e.name AS entity, s.period_type, to_char(s.period_end, 'YYYY-MM-DD') AS period_end, s.currency, s.lines FROM financials.statements s JOIN core.entities e ON e.id = s.entity_id WHERE s.entity_id IS NOT NULL")).rows
  const financials: ChecksResult['financials'] = []
  for (const s of fs) {
    const L = s.lines ?? {}, num = (k: string) => (typeof L[k] === 'number' ? (L[k] as number) : 0)
    const opex = typeof L.opex_total === 'number' ? L.opex_total : num('opex_payroll') + num('opex_marketing') + num('opex_rnd') + num('opex_ga') + num('opex_other')
    const costs = Math.abs(opex) + Math.abs(num('cogs'))
    if (!costs) continue
    const months = s.period_type === 'year' ? 12 : s.period_type === 'quarter' ? 3 : 1
    const end = new Date(s.period_end + 'T00:00:00Z'), start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - months + 1, 1)).toISOString().slice(0, 10)
    const logged = pays.filter((p) => p.entity_id === s.entity_id && p.currency === s.currency && p.paid_on >= start && p.paid_on <= s.period_end).reduce((a, p) => a + p.amount, 0)
    const label = s.period_type === 'month' ? s.period_end.slice(0, 7) : s.period_type === 'quarter' ? 'Q' + Math.ceil((end.getUTCMonth() + 1) / 3) + ' ' + end.getUTCFullYear() : 'FY ' + end.getUTCFullYear()
    if (logged > costs * 1.01 + 1) financials.push({ entity: s.entity, period: label, currency: s.currency, logged, statement_costs: costs, text: 'Payments logged (' + fmt(logged, s.currency) + ') are more than the total costs in the financial statements (' + fmt(costs, s.currency) + ').' })
  }
  const vals = Object.values(by_id)
  return { by_id, unlogged, financials, summary: {
    payments: pays.length, bank_matched: vals.filter((v) => v.bank === 'matched').length, bank_missing: vals.filter((v) => v.bank === 'missing').length,
    bank_no_statement: vals.filter((v) => v.bank === 'no_statement').length, receipt_mismatch: vals.filter((v) => v.receipt === 'mismatch' || v.receipt === 'unreadable').length,
    unlogged: unlogged.length, financials: financials.length } }
}
