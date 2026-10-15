// Balance for a period: each bank account (money out vs what logged payments, deployments and team pay explain) and each
// category (logged vs posted to the journals, rolled up to the financial statement lines).
import { z } from 'zod'
import { isDate } from '~/shared/date-range'
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp')
  const q = z.object({ from: z.string().refine(isDate), to: z.string().refine(isDate) }).safeParse(getQuery(event))
  if (!q.success) throw apiError('invalid', 'Choose the dates.')
  const { from, to } = q.data
  const chk = await paymentChecks(), cats = await expenseCategories(true)
  const ents = new Map((await db().query<{ id: string; name: string }>('SELECT id, name FROM core.entities')).rows.map((e) => [e.id, e.name]))
  const pays = (await db().query<{ id: string; paid_on: string; amount: number; currency: string; category: string; entity_id: string | null; bank_account_id: string | null }>(
    "SELECT id, to_char(paid_on, 'YYYY-MM-DD') AS paid_on, amount::float AS amount, currency, category, entity_id, bank_account_id FROM finance.expenses WHERE paid_on BETWEEN $1 AND $2", [from, to])).rows
  const r2 = (n: number) => Math.round(n * 100) / 100
  // Bank accounts.
  const accounts = chk.ledger.accounts.map((a) => {
    const t = chk.ledger.txns.filter((x) => x.account_id === a.id && x.date >= from && x.date <= to)
    const out = t.reduce((s, x) => s - x.amount, 0), explained = t.filter((x) => x.matched).reduce((s, x) => s - x.amount, 0)
    const st = chk.ledger.statements.filter((s) => s.account_id === a.id && s.end >= from && s.start <= to)
    const coveredFrom = st.length ? st.map((s) => s.start).sort()[0]! : null, coveredTo = st.length ? st.map((s) => s.end).sort().reverse()[0]! : null
    const mine = pays.filter((p) => p.bank_account_id === a.id || (!p.bank_account_id && p.entity_id === a.entity_id && p.currency === a.currency))
    const notInBank = mine.filter((p) => chk.by_id[p.id]?.bank === 'missing')
    return { id: a.id, name: a.name, currency: a.currency, entity: ents.get(a.entity_id) ?? null, statements: st.length ? { from: coveredFrom, to: coveredTo, full: coveredFrom! <= from && coveredTo! >= to } : null,
      money_out: r2(out), explained: r2(explained), unexplained: r2(out - explained), unexplained_count: t.filter((x) => !x.matched).length,
      by: { payments: r2(t.filter((x) => x.matched === 'payment').reduce((s, x) => s - x.amount, 0)), deployments: r2(t.filter((x) => x.matched === 'deployment').reduce((s, x) => s - x.amount, 0)), team_pay: r2(t.filter((x) => x.matched === 'team_pay').reduce((s, x) => s - x.amount, 0)) },
      logged_not_in_bank: r2(notInBank.reduce((s, p) => s + p.amount, 0)), logged_not_in_bank_count: notInBank.length }
  }).filter((a) => a.money_out || a.logged_not_in_bank || a.statements)
  // Categories against the journals.
  const jr = (await db().query<{ account: string; currency: string; v: number }>("SELECT account, currency, sum(debit - credit)::float AS v FROM finance.journal WHERE account LIKE 'Expense: %' AND entry_date BETWEEN $1 AND $2 GROUP BY 1, 2", [from, to])).rows
  const keys = new Set([...pays.map((p) => p.category + '|' + p.currency), ...jr.map((j) => j.account.slice(9) + '|' + j.currency)])
  const categories = [...keys].map((k) => { const [name, currency] = k.split('|') as [string, string]; const c = cats.find((x) => x.name === name)
    const logged = r2(pays.filter((p) => p.category === name && p.currency === currency).reduce((s, p) => s + p.amount, 0)), journal = r2(jr.filter((j) => j.account === 'Expense: ' + name && j.currency === currency).reduce((s, j) => s + j.v, 0))
    return { name, currency, line: c?.line ?? 'opex_other', line_label: STATEMENT_LINES[c?.line ?? 'opex_other'], known: !!c, logged, journal, difference: r2(logged - journal) } }).sort((a, b) => b.logged - a.logged)
  const lines: Record<string, Record<string, number>> = {}
  for (const c of categories) { lines[c.line] ??= {}; lines[c.line]![c.currency] = r2((lines[c.line]![c.currency] ?? 0) + c.logged) }
  return { from, to, accounts, categories, lines: Object.entries(lines).map(([k, v]) => ({ line: k, label: STATEMENT_LINES[k as StatementLine], totals: v })), line_labels: STATEMENT_LINES }
})
