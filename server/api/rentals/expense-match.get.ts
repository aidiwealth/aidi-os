// Bank payments that could be a logged expense: unlogged payments out of Aidi Haven's accounts within 10 days and
// close in amount (exact first).
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team')
  const id = String(getQuery(event).id ?? '')
  if (!/^[0-9a-f-]{36}$/.test(id)) throw apiError('invalid', 'Invalid request.')
  const e = (await db().query<{ amount: number; spent_on: string }>("SELECT amount::float, to_char(spent_on, 'YYYY-MM-DD') AS spent_on FROM rentals.expenses WHERE id = $1", [id])).rows[0]
  if (!e) throw apiError('not_found', 'Expense not found', 404)
  const ent = await havenEntityId()
  return (await db().query(`SELECT b.id, to_char(b.txn_date, 'YYYY-MM-DD') AS txn_date, b.description, -b.amount::float AS amount, a.bank_name || coalesce(' ····' || a.last4, '') AS account
      FROM banking.transactions b JOIN banking.accounts a ON a.id = b.account_id
     WHERE b.amount < 0 AND ($1::uuid IS NULL OR a.entity_id = $1) AND b.txn_date BETWEEN $3::date - 10 AND $3::date + 10 AND abs(-b.amount - $2) <= greatest(1, $2 * 0.05)
       AND NOT EXISTS (SELECT 1 FROM rentals.expenses x WHERE x.bank_txn_id = b.id)
     ORDER BY abs(-b.amount - $2), abs(b.txn_date - $3::date) LIMIT 8`, [ent, e.amount, e.spent_on])).rows
})
