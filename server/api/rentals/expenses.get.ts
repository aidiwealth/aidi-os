// Expenses, filtered by property, month (or year) and category.
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'team')
  await runRecurringExpenses()
  const q = getQuery(event)
  const period = PERIOD_RE.test(String(q.period ?? '')) ? String(q.period) : q.period === 'all' ? '' : lastMonth()
  const prop = /^[0-9a-f-]{36}$|^shared$/.test(String(q.property ?? '')) ? String(q.property) : null
  const cat = /^[a-z0-9_]{2,40}$/.test(String(q.category ?? '')) ? String(q.category) : null
  const r = period ? rentalRange(period) : { from: '1900-01-01', to: '2999-12-31' }
  const rows = (await db().query(`SELECT e.id, e.property_id, coalesce(p.name, 'All properties (shared)') AS property, e.unit_id, u.name AS unit, e.category, c.label AS category_label, e.item, e.quantity::float, e.vendor, e.amount::float, to_char(e.spent_on, 'YYYY-MM-DD') AS spent_on, e.receipt_document_id, e.recurring, e.recurred_from, e.notes, e.bank_txn_id
      FROM rentals.expenses e LEFT JOIN rentals.properties p ON p.id = e.property_id LEFT JOIN rentals.units u ON u.id = e.unit_id LEFT JOIN rentals.expense_categories c ON c.code = e.category
     WHERE e.spent_on BETWEEN $1 AND $2 AND ($3::text IS NULL OR ($3 = 'shared' AND e.property_id IS NULL) OR e.property_id::text = $3) AND ($4::text IS NULL OR e.category = $4) ORDER BY e.spent_on DESC, e.created_at DESC LIMIT 1000`, [r.from, r.to, prop, cat])).rows
  const categories = (await db().query('SELECT code, label, hint FROM rentals.expense_categories ORDER BY sort, label')).rows
  const props = (await db().query('SELECT id, name FROM rentals.properties WHERE active ORDER BY sort, name')).rows
  const units = (await db().query('SELECT id, property_id, name FROM rentals.units WHERE active ORDER BY sort, name')).rows
  return { rows, categories, properties: props, units, locked: [...(await lockedPeriods())], admin: isRentalAdmin(user.roles) }
})
