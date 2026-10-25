// Books check: every logged payment and deployment must have book entries that balance and match the amount logged.
// Anything that does not is flagged so it can be fixed before the numbers are relied on.
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin', 'gp')
  // group: not_in_bank (logged but missing from the statement), not_logged (left the bank, never logged), other.
  const flags: { kind: string; ref: string; text: string; to: string; group?: 'not_in_bank' | 'not_logged' | 'other'; date?: string; amount?: number; currency?: string; what?: string }[] = []
  const exp = (await db().query<{ id: string; number: string | null; payee: string; amount: number; currency: string; d: number; c: number; n: number }>(
    `SELECT x.id, x.number, x.payee, x.amount::float AS amount, x.currency, coalesce(sum(j.debit), 0)::float AS d, coalesce(sum(j.credit), 0)::float AS c, count(j.id)::int AS n
       FROM finance.expenses x LEFT JOIN finance.journal j ON j.expense_id = x.id GROUP BY x.id ORDER BY x.paid_on DESC`)).rows
  const fmt = (v: number, c: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency: c }).format(v)
  for (const x of exp) {
    const label = (x.number ? x.number + ' · ' : '') + x.payee
    if (!x.n) flags.push({ kind: 'Payment', ref: label, text: 'Logged for ' + fmt(x.amount, x.currency) + ' but has no book entries.', to: '/expenses' })
    else if (Math.abs(x.d - x.c) >= 0.01) flags.push({ kind: 'Payment', ref: label, text: 'Book entries do not balance: debits ' + fmt(x.d, x.currency) + ', credits ' + fmt(x.c, x.currency) + '.', to: '/expenses' })
    else if (Math.abs(x.d - x.amount) >= 0.01) flags.push({ kind: 'Payment', ref: label, text: 'Logged as ' + fmt(x.amount, x.currency) + ' but posted to the books as ' + fmt(x.d, x.currency) + '.', to: '/expenses' })
  }
  const dep = (await db().query<{ id: string; company: string | null; amount: number; currency: string; d: number; c: number; n: number }>(
    `SELECT p.id, p.company, p.amount::float AS amount, p.currency, coalesce(sum(j.debit), 0)::float AS d, coalesce(sum(j.credit), 0)::float AS c, count(j.id)::int AS n
       FROM finance.deployments p LEFT JOIN finance.journal j ON j.deployment_id = p.id GROUP BY p.id`)).rows
  for (const p of dep) {
    const label = p.company ?? 'Deployment'
    if (!p.n) flags.push({ kind: 'Deployment', ref: label, text: 'Logged for ' + fmt(p.amount, p.currency) + ' but has no book entries.', to: '/deployments' })
    else if (Math.abs(p.d - p.c) >= 0.01) flags.push({ kind: 'Deployment', ref: label, text: 'Book entries do not balance: debits ' + fmt(p.d, p.currency) + ', credits ' + fmt(p.c, p.currency) + '.', to: '/deployments' })
  }
  const tot = (await db().query<{ currency: string; d: number; c: number }>('SELECT currency, sum(debit)::float AS d, sum(credit)::float AS c FROM finance.journal GROUP BY 1')).rows
  for (const t of tot) if (Math.abs(t.d - t.c) >= 0.01) flags.push({ kind: 'Journals', ref: t.currency + ' journal', text: 'Total debits ' + fmt(t.d, t.currency) + ' and credits ' + fmt(t.c, t.currency) + ' are out by ' + fmt(t.d - t.c, t.currency) + '.', to: '/books' })
  // Payments against the bank, their receipts and the financial statements.
  const pc = await paymentChecks()
  const xs = (await db().query<{ id: string; number: string | null; payee: string; amount: number; currency: string; paid_on: string | null }>("SELECT id, number, payee, amount::float AS amount, currency, to_char(paid_on, 'YYYY-MM-DD') AS paid_on FROM finance.expenses")).rows
  const num = new Map(xs.map((r) => [r.id, (r.number ? r.number + ' · ' : '') + r.payee])), xby = new Map(xs.map((r) => [r.id, r]))
  for (const [id, c] of Object.entries(pc.by_id)) {
    if (c.bank === 'missing') { const x = xby.get(id); flags.push({ kind: 'Payment', ref: num.get(id) ?? 'Payment', text: 'Not found in the imported bank statement for that date.', to: '/expenses', group: 'not_in_bank', date: x?.paid_on ?? undefined, amount: x?.amount, currency: x?.currency, what: num.get(id) ?? 'Payment' }) }
    if (c.receipt === 'mismatch' || c.receipt === 'unreadable') flags.push({ kind: 'Receipt', ref: num.get(id) ?? 'Payment', text: c.receipt_issues.join(' ') || 'Receipt could not be read.', to: '/expenses' })
  }
  for (const u of pc.unlogged) flags.push({ kind: 'Bank', ref: u.date + ' · ' + u.account, text: fmt(u.amount, u.currency) + ' left the bank (' + u.description + ') but is not logged as a payment or deployment.', to: '/expenses', group: 'not_logged', date: u.date, amount: u.amount, currency: u.currency, what: u.description.replace(/^\[[^\]]*\]\s*/, '').split(' · ')[0]!.slice(0, 90) + ' · ' + u.account })
  for (const f of pc.financials) flags.push({ kind: 'Financials', ref: f.entity + ' · ' + f.period, text: f.text, to: '/financials' })
  return { ok: !flags.length, checked: { payments: exp.length, deployments: dep.length }, flags }
})
