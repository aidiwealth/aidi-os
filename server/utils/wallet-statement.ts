// Wallet statements: up to 31 days download straight away; longer periods (up to a year) are built in the background and emailed.
export const STATEMENT_NOW_DAYS = 31, STATEMENT_MAX_DAYS = 366
const ISO = /^\d{4}-\d{2}-\d{2}$/
export function statementRange(from: unknown, till: unknown): { from: string; till: string; days: number } {
  const today = new Date().toISOString().slice(0, 10)
  const t = typeof till === 'string' && ISO.test(till) ? till : today
  const f = typeof from === 'string' && ISO.test(from) ? from : new Date(Date.parse(t) - (STATEMENT_NOW_DAYS - 1) * 864e5).toISOString().slice(0, 10)
  if (Number.isNaN(Date.parse(f)) || Number.isNaN(Date.parse(t))) throw apiError('invalid', 'Choose the dates.')
  if (f > t) throw apiError('invalid', 'The start date is after the end date.')
  if (t > today) throw apiError('invalid', 'The end date is in the future.')
  const days = Math.round((Date.parse(t) - Date.parse(f)) / 864e5) + 1
  if (days > STATEMENT_MAX_DAYS) throw apiError('invalid', 'A statement can cover up to one year.')
  return { from: f, till: t, days }
}
// The CSV: opening balance, every movement oldest first, closing balance.
export async function walletStatementCsv(orgId: string, from: string, till: string): Promise<string> {
  return await asPlatform(async () => {
    const r = await db().query<{ created_at: string; kind: string; category: string; reason: string; amount: string; balance: string; currency: string }>(
      `SELECT to_char(created_at, 'YYYY-MM-DD HH24:MI') AS created_at, kind, category, reason, (amount_minor / 100.0)::numeric(14,2)::text AS amount, (balance_after_minor / 100.0)::numeric(14,2)::text AS balance, currency
         FROM wallet.ledger WHERE organization_id = $1 AND created_at >= $2::date AND created_at < $3::date + 1 ORDER BY created_at, id`, [orgId, from, till])
    // Opening balance: the balance before the first movement in the period, else the last balance before it.
    const first = r.rows[0]
    const open = first ? (Number(first.balance) + (first.kind === 'debit' ? 1 : -1) * Number(first.amount)).toFixed(2)
      : (await db().query<{ b: string | null }>("SELECT (balance_after_minor / 100.0)::numeric(14,2)::text AS b FROM wallet.ledger WHERE organization_id = $1 AND created_at < $2::date ORDER BY created_at DESC, id DESC LIMIT 1", [orgId, from])).rows[0]?.b ?? '0.00'
    const cur = r.rows[0]?.currency ?? (await walletOf(orgId)).currency
    const esc = (s: string) => '"' + s.replaceAll('"', '""') + '"'
    const close = r.rows.length ? r.rows[r.rows.length - 1]!.balance : open
    return ['Date,Type,Category,Description,Amount,Balance,Currency', [from, '', '', 'Opening balance', '', open, cur].join(','),
      ...r.rows.map((x) => [x.created_at, x.kind, x.category, esc(x.reason), (x.kind === 'debit' ? '-' : '') + x.amount, x.balance, x.currency].join(',')),
      [till, '', '', 'Closing balance', '', close, cur].join(',')].join('\n')
  })
}
