// Money for a month: Airbnb payouts (each with the bookings it settles, fees and taxes, and its bank deposit) and rent
// due, each Paid, Pending or Needs attention; the month's imports and whether it is locked.
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'team')
  await ensureRentCharges(); await reconcile()
  const latest = (await db().query<{ p: string | null }>("SELECT to_char(max(txn_date), 'YYYY-MM') AS p FROM rentals.transactions")).rows[0]?.p
  const q = String(getQuery(event).period ?? '')
  const period = /^20\d{2}-[01]\d$/.test(q) ? q : latest ?? new Date().toISOString().slice(0, 7)
  const { from, to } = rentalRange(period)
  const tx = (await db().query<{ id: string; type: string; txn_date: string; expected_arrival: string | null; confirmation_code: string | null; check_in: string | null; check_out: string | null; nights: number | null; guest: string | null; listing: string | null; unit: string | null; details: string | null; payout_ref: string | null; settled_by: string | null; amount: number | null; paid_out: number | null; service_fee: number | null; cleaning_fee: number | null; gross: number | null; remitted_tax: number | null }>(
    `SELECT t.id, t.type, to_char(t.txn_date, 'YYYY-MM-DD') AS txn_date, to_char(t.expected_arrival, 'YYYY-MM-DD') AS expected_arrival, t.confirmation_code, to_char(t.check_in, 'YYYY-MM-DD') AS check_in, to_char(t.check_out, 'YYYY-MM-DD') AS check_out, t.nights, t.guest, t.listing, u.name AS unit, t.details, t.payout_ref, t.settled_by,
            t.amount::float, t.paid_out::float, t.service_fee::float, t.cleaning_fee::float, t.gross::float, t.remitted_tax::float
       FROM rentals.transactions t LEFT JOIN rentals.units u ON u.id = t.unit_id WHERE t.txn_date BETWEEN $1 AND $2 ORDER BY t.txn_date DESC, t.created_at`, [from, to])).rows
  const matches = new Map((await db().query<{ payout_ref: string; method: string; note: string | null; bank_txn_id: string | null; txn_date: string | null; description: string | null; amount: number | null; account: string | null }>(
    `SELECT m.payout_ref, m.method, m.note, m.bank_txn_id, to_char(b.txn_date, 'YYYY-MM-DD') AS txn_date, b.description, b.amount::float, a.bank_name || ' ····' || coalesce(a.last4, '') AS account FROM rentals.payout_matches m LEFT JOIN banking.transactions b ON b.id = m.bank_txn_id LEFT JOIN banking.accounts a ON a.id = b.account_id`)).rows.map((m) => [m.payout_ref, m]))
  const today = new Date().toISOString().slice(0, 10)
  const plus = (d: string, n: number) => new Date(Date.parse(d) + n * 86400000).toISOString().slice(0, 10)
  const payouts = tx.filter((t) => /^payout$/i.test(t.type)).map((p) => { const m = p.payout_ref ? matches.get(p.payout_ref) : undefined; const arrive = p.expected_arrival ?? p.txn_date
    return { ...p, rows: tx.filter((r) => r.settled_by && r.settled_by === p.payout_ref), match: m ?? null, status: m ? 'paid' : today <= plus(arrive, 5) ? 'pending' : 'attention' } })
  const loose = tx.filter((t) => !/^payout$/i.test(t.type) && (!t.settled_by || !payouts.some((p) => p.payout_ref === t.settled_by)))
  const rent = (await db().query<{ id: string; tenant_name: string; unit: string; property: string; due_on: string; amount: number; paid_amount: number | null; paid_on: string | null; method: string | null; note: string | null }>(
    `SELECT c.id, l.tenant_name, u.name AS unit, p.name AS property, to_char(c.due_on, 'YYYY-MM-DD') AS due_on, c.amount::float, c.paid_amount::float, to_char(c.paid_on, 'YYYY-MM-DD') AS paid_on, c.method, c.note
       FROM rentals.rent_charges c JOIN rentals.leases l ON l.id = c.lease_id JOIN rentals.units u ON u.id = l.unit_id JOIN rentals.properties p ON p.id = u.property_id WHERE c.period = $1 ORDER BY c.due_on`, [period])).rows.map((c) => ({ ...c, status: rentStatus(c) }))
  const imports = (await db().query("SELECT i.id, i.period, i.status, i.rows_new, i.rows_dup, i.checks, i.control IS NOT NULL AS has_pdf, i.csv_document_id, i.pdf_document_id, i.saved_at, p.full_name AS by FROM rentals.imports i LEFT JOIN core.users u ON u.id = i.imported_by LEFT JOIN core.people p ON p.id = u.person_id WHERE i.status = 'saved' AND i.period = $1 ORDER BY i.saved_at DESC", [period])).rows
  const sum = (xs: number[]) => Math.round(xs.reduce((s, x) => s + x, 0) * 100) / 100
  const totals = { paid_out: sum(payouts.map((p) => p.paid_out ?? 0)), matched: sum(payouts.filter((p) => p.status === 'paid').map((p) => p.paid_out ?? 0)), gross: sum(tx.filter((t) => /^reservation$/i.test(t.type)).map((t) => t.gross ?? 0)), fees: sum(tx.map((t) => t.service_fee ?? 0)), tax: sum(tx.map((t) => t.remitted_tax ?? 0)), rent_due: sum(rent.map((r) => r.amount)), rent_paid: sum(rent.map((r) => r.paid_amount ?? 0)), attention: payouts.filter((p) => p.status === 'attention').length + rent.filter((r) => r.status === 'overdue' || r.status === 'partial').length }
  const periods = (await db().query<{ p: string }>("SELECT DISTINCT to_char(txn_date, 'YYYY-MM') AS p FROM rentals.transactions UNION SELECT period FROM rentals.rent_charges ORDER BY 1 DESC")).rows.map((r) => r.p)
  return { period, label: monthLabel(period), payouts, loose, rent, imports, totals, periods, locked: (await lockedPeriods()).has(period), admin: isRentalAdmin(user.roles) }
})
