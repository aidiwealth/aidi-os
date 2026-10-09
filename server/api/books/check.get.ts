// Books check: every logged payment and deployment must have book entries that balance and match the amount logged.
// Anything that does not is flagged so it can be fixed before the numbers are relied on.
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin', 'gp')
  const flags: { kind: string; ref: string; text: string; to: string }[] = []
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
  const num = new Map((await db().query<{ id: string; number: string | null; payee: string }>('SELECT id, number, payee FROM finance.expenses')).rows.map((r) => [r.id, (r.number ? r.number + ' · ' : '') + r.payee]))
  for (const [id, c] of Object.entries(pc.by_id)) {
    if (c.bank === 'missing') flags.push({ kind: 'Payment', ref: num.get(id) ?? 'Payment', text: 'Not found in the imported bank statement for that date.', to: '/expenses' })
    if (c.receipt === 'mismatch' || c.receipt === 'unreadable') flags.push({ kind: 'Receipt', ref: num.get(id) ?? 'Payment', text: c.receipt_issues.join(' ') || 'Receipt could not be read.', to: '/expenses' })
  }
  for (const u of pc.unlogged.slice(0, 20)) flags.push({ kind: 'Bank', ref: u.date + ' · ' + u.account, text: fmt(u.amount, u.currency) + ' left the bank (' + u.description + ') but is not logged as a payment or deployment.', to: '/expenses' })
  for (const f of pc.financials) flags.push({ kind: 'Financials', ref: f.entity + ' · ' + f.period, text: f.text, to: '/financials' })
  return { ok: !flags.length, checked: { payments: exp.length, deployments: dep.length }, flags }
})
