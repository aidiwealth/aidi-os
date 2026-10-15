// Download payments for a period (and entity / category if chosen) as CSV or Excel, with bank-match status.
import { z } from 'zod'
import { isDate } from '~/shared/date-range'
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp')
  const q = z.object({ from: z.string().refine(isDate), to: z.string().refine(isDate), entity_id: z.string().uuid().optional().or(z.literal('').transform(() => undefined)), category: z.string().max(60).optional(), format: z.enum(['csv', 'xlsx']).default('csv'), label: z.string().max(60).optional() }).safeParse(getQuery(event))
  if (!q.success) throw apiError('invalid', 'Choose the dates to export.')
  const d = q.data
  const rows = (await db().query<{ id: string; number: string; paid_on: string; payee: string; category: string; description: string | null; amount: number; currency: string; method: string | null; reference: string | null; entity: string | null; account: string | null }>(
    `SELECT x.id, x.number, to_char(x.paid_on, 'YYYY-MM-DD') AS paid_on, x.payee, x.category, x.description, x.amount::float AS amount, x.currency, x.method, x.reference, e.name AS entity,
            a.bank_name || coalesce(' •••' || a.last4, '') AS account
       FROM finance.expenses x LEFT JOIN core.entities e ON e.id = x.entity_id LEFT JOIN banking.accounts a ON a.id = x.bank_account_id
      WHERE x.paid_on BETWEEN $1 AND $2 AND ($3::uuid IS NULL OR x.entity_id = $3) AND ($4::text IS NULL OR x.category = $4) ORDER BY x.paid_on, x.number`, [d.from, d.to, d.entity_id ?? null, d.category || null])).rows
  const chk = await paymentChecks(), cats = await expenseCategories(true)
  const BANK: Record<string, string> = { matched: 'In bank', missing: 'Not in bank', no_statement: 'Awaiting statement', no_account: 'No bank account' }
  const out = rows.map((r) => ({ ...r, line: STATEMENT_LINES[cats.find((c) => c.name === r.category)?.line ?? 'opex_other'], bank: BANK[chk.by_id[r.id]?.bank ?? 'no_account'], bank_date: chk.by_id[r.id]?.bank_txn?.date ?? '' }))
  const totals: Record<string, number> = {}; for (const r of rows) totals[r.currency] = Math.round(((totals[r.currency] ?? 0) + r.amount) * 100) / 100
  return sendTable(event, { file: 'Payments ' + d.from + ' to ' + d.to, title: 'Payments' + (d.category ? ' · ' + d.category : ''), period: (d.label ? d.label + ': ' : '') + d.from + ' to ' + d.to, format: d.format,
    cols: [{ key: 'paid_on', label: 'Date' }, { key: 'number', label: 'Voucher' }, { key: 'payee', label: 'Paid to' }, { key: 'category', label: 'Category' }, { key: 'line', label: 'Statement line' }, { key: 'entity', label: 'Entity' }, { key: 'account', label: 'Bank account' }, { key: 'currency', label: 'Currency' }, { key: 'amount', label: 'Amount', money: true }, { key: 'method', label: 'Method' }, { key: 'reference', label: 'Reference' }, { key: 'description', label: 'What it was for' }, { key: 'bank', label: 'Bank check' }, { key: 'bank_date', label: 'Bank date' }],
    rows: out, totals: [{ label: 'Total', values: totals }] })
})
