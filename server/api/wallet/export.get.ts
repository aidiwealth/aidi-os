// The last 90 days of wallet transactions as CSV.
export default defineEventHandler(async (event) => {
  await requireUser(event)
  const r = await db().query<{ created_at: string; kind: string; category: string; reason: string; amount: string; balance: string; currency: string }>(
    "SELECT to_char(created_at, 'YYYY-MM-DD HH24:MI') AS created_at, kind, category, reason, (amount_minor / 100.0)::text AS amount, (balance_after_minor / 100.0)::text AS balance, currency FROM wallet.ledger WHERE created_at > now() - interval '90 days' ORDER BY created_at DESC")
  const esc = (s: string) => '"' + s.replaceAll('"', '""') + '"'
  setHeader(event, 'content-type', 'text/csv'); setHeader(event, 'content-disposition', 'attachment; filename="wallet.csv"')
  return ['Date,Type,Category,Description,Amount,Balance,Currency', ...r.rows.map((x) => [x.created_at, x.kind, x.category, esc(x.reason), (x.kind === 'debit' ? '-' : '') + x.amount, x.balance, x.currency].join(','))].join('\n')
})
