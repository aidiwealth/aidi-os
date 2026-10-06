export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp')
  const rows = (await db().query(`SELECT x.id, x.number, to_char(x.paid_on, 'YYYY-MM-DD') AS paid_on, x.payee, x.category, x.description, x.amount::float AS amount, x.currency, x.method, x.reference, x.voucher_id, x.attachment_id, e.name AS entity, x.entity_id
      FROM finance.expenses x LEFT JOIN core.entities e ON e.id = x.entity_id ORDER BY x.paid_on DESC, x.created_at DESC LIMIT 1000`)).rows
  const options = { entities: (await db().query("SELECT id, name FROM core.entities WHERE status <> 'dissolved' ORDER BY name")).rows,
    accounts: (await db().query("SELECT id, bank_name || ' · ' || coalesce(account_name, '') || coalesce(' •••' || last4, '') AS name, entity_id, currency FROM banking.accounts WHERE active ORDER BY bank_name")).rows, categories: EXPENSE_CATEGORIES,
    payees: (await db().query('SELECT DISTINCT payee FROM finance.expenses ORDER BY payee LIMIT 300')).rows.map((r: { payee: string }) => r.payee) }
  return { rows, options }
})
