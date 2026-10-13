// Bank deposits that could be a payout: same amount (or close) within two weeks, not already matched.
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team')
  const ref = String(getQuery(event).payout_ref ?? '')
  const p = (await db().query<{ paid_out: string; arrive: string }>("SELECT paid_out::text, to_char(coalesce(expected_arrival, txn_date), 'YYYY-MM-DD') AS arrive FROM rentals.transactions WHERE payout_ref = $1 AND type ILIKE 'payout' LIMIT 1", [ref])).rows[0]
  if (!p) throw apiError('not_found', 'Payout not found', 404)
  const rows = (await db().query(`SELECT b.id, to_char(b.txn_date, 'YYYY-MM-DD') AS txn_date, b.description, b.amount::float, a.bank_name || ' ····' || coalesce(a.last4, '') AS account FROM banking.transactions b JOIN banking.accounts a ON a.id = b.account_id
    WHERE b.amount > 0 AND b.txn_date BETWEEN $2::date - 14 AND $2::date + 21 AND NOT EXISTS (SELECT 1 FROM rentals.payout_matches m WHERE m.bank_txn_id = b.id)
    ORDER BY abs(b.amount - $1::numeric), abs(b.txn_date - $2::date) LIMIT 15`, [p.paid_out, p.arrive])).rows
  return { amount: Number(p.paid_out), arrive: p.arrive, rows }
})
