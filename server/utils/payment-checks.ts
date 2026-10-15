// Payment checks: every logged payment is cross-checked against the bank statements imported in Banking and the
// financial statements in Financials, and against its receipt. Anything that does not agree is flagged.
export type BankStatus = 'matched' | 'missing' | 'no_statement' | 'no_account'
export interface PaymentCheck { bank: BankStatus; bank_txn?: { id?: string; date: string; description: string; account_id?: string }; receipt: string | null; receipt_issues: string[] }
export interface ChecksResult {
  by_id: Record<string, PaymentCheck>
  unlogged: { date: string; account: string; description: string; amount: number; currency: string }[]
  financials: { entity: string; period: string; currency: string; logged: number; statement_costs: number; text: string }[]
  summary: { payments: number; bank_matched: number; bank_missing: number; bank_no_statement: number; receipt_mismatch: number; unlogged: number; financials: number }
  // For team pay and the balance view (not sent to the Payments page as is).
  hr_by_id: Record<string, { bank: BankStatus; bank_txn?: { id: string; date: string; description: string; account_id: string }; linked: boolean }>
  ledger: { accounts: { id: string; entity_id: string; currency: string; name: string }[]; statements: { account_id: string; start: string; end: string }[]; txns: { id: string; account_id: string; date: string; description: string; amount: number; matched: 'payment' | 'deployment' | 'team_pay' | null }[] }
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
  const hr = (await db().query<{ id: string; paid_on: string; amount: number; currency: string; entity_id: string | null; expense_id: string | null; bank_txn_id: string | null }>(
    "SELECT h.id, to_char(h.paid_on, 'YYYY-MM-DD') AS paid_on, h.amount::float AS amount, h.currency, p.entity_id, h.expense_id, h.bank_txn_id FROM hr.payments h JOIN hr.people p ON p.id = h.person_id ORDER BY h.paid_on").catch(() => ({ rows: [] }))).rows
  const used = new Set<string>(), kindOf = new Map<string, 'payment' | 'deployment' | 'team_pay'>()
  // Team payments someone linked to a bank line by hand keep that line.
  for (const h of hr) if (h.bank_txn_id) { used.add(h.bank_txn_id); kindOf.set(h.bank_txn_id, 'team_pay') }
  const candidates = (p: { entity_id: string | null; bank_account_id: string | null; currency: string }) =>
    p.bank_account_id ? accounts.filter((a) => a.id === p.bank_account_id) : accounts.filter((a) => a.entity_id === p.entity_id && a.currency === p.currency)
  const covered = (accIds: string[], date: string) => stmts.some((s) => accIds.includes(s.account_id) && s.start <= date && s.end >= date)
  function match(p: { paid_on: string; amount: number; entity_id: string | null; bank_account_id: string | null; currency: string }, kind: 'payment' | 'deployment' | 'team_pay' = 'payment'): { status: BankStatus; txn?: typeof txns[number] } {
    const accs = candidates(p).map((a) => a.id)
    if (!accs.length) return { status: 'no_account' }
    const t = txns.filter((x) => !used.has(x.id) && accs.includes(x.account_id) && Math.abs(-x.amount - p.amount) < 0.01 && dayDiff(x.date, p.paid_on) <= DAYS)
      .sort((a, b) => dayDiff(a.date, p.paid_on) - dayDiff(b.date, p.paid_on))[0]
    if (t) { used.add(t.id); kindOf.set(t.id, kind); return { status: 'matched', txn: t } }
    return { status: covered(accs, p.paid_on) ? 'missing' : 'no_statement' }
  }
  const by_id: Record<string, PaymentCheck> = {}
  const txnById0 = new Map(txns.map((t) => [t.id, t]))
  const linkedExp = new Map(hr.filter((h) => h.bank_txn_id && h.expense_id && txnById0.get(h.bank_txn_id)).map((h) => [h.expense_id!, txnById0.get(h.bank_txn_id!)!]))
  for (const p of pays) {
    const lt = linkedExp.get(p.id)
    const m = lt ? { status: 'matched' as BankStatus, txn: lt } : match(p)
    by_id[p.id] = { bank: m.status, bank_txn: m.txn ? { id: m.txn.id, date: m.txn.date, description: m.txn.description, account_id: m.txn.account_id } : undefined, receipt: p.receipt_status, receipt_issues: p.receipt_issues ?? [] }
  }
  for (const d of deps) match(d, 'deployment') // deployments also explain money out of the bank
  // Team pay: through its Payments entry when it has one, a hand-made link, or its own match on the person's company accounts.
  const txnById = new Map(txns.map((t) => [t.id, t]))
  const hr_by_id: ChecksResult['hr_by_id'] = {}
  for (const h of hr) {
    if (h.bank_txn_id && txnById.get(h.bank_txn_id)) { const t = txnById.get(h.bank_txn_id)!; hr_by_id[h.id] = { bank: 'matched', bank_txn: { id: t.id, date: t.date, description: t.description, account_id: t.account_id }, linked: true }; continue }
    if (h.expense_id && by_id[h.expense_id]) { const e = by_id[h.expense_id]!; hr_by_id[h.id] = { bank: e.bank, bank_txn: e.bank_txn?.id ? { id: e.bank_txn.id, date: e.bank_txn.date, description: e.bank_txn.description, account_id: e.bank_txn.account_id! } : undefined, linked: false }; continue }
    const m = match({ ...h, bank_account_id: null }, 'team_pay')
    hr_by_id[h.id] = { bank: m.status, bank_txn: m.txn ? { id: m.txn.id, date: m.txn.date, description: m.txn.description, account_id: m.txn.account_id } : undefined, linked: false }
  }
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
  const ledger = { accounts, statements: stmts, txns: txns.map((t) => ({ ...t, matched: kindOf.get(t.id) ?? null })) }
  return { by_id, unlogged, financials, hr_by_id, ledger, summary: {
    payments: pays.length, bank_matched: vals.filter((v) => v.bank === 'matched').length, bank_missing: vals.filter((v) => v.bank === 'missing').length,
    bank_no_statement: vals.filter((v) => v.bank === 'no_statement').length, receipt_mismatch: vals.filter((v) => v.receipt === 'mismatch' || v.receipt === 'unreadable').length,
    unlogged: unlogged.length, financials: financials.length } }
}
