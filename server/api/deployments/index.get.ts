// Money deployed (credit, Angel Fund, venture fund) and the books it posted to.
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp')
  const rows = (await db().query(`SELECT d.*, d.amount::float AS amount, to_char(d.paid_on, 'YYYY-MM-DD') AS paid_on, e.name AS entity, fe.name AS fund, l.reference AS loan_ref, h.name AS holding
      FROM finance.deployments d LEFT JOIN core.entities e ON e.id = d.paying_entity_id LEFT JOIN funds.funds f ON f.id = d.fund_id LEFT JOIN core.entities fe ON fe.id = f.entity_id LEFT JOIN credit.loans l ON l.id = d.loan_id LEFT JOIN wealth.holdings h ON h.id = d.holding_id
     ORDER BY d.paid_on DESC, d.created_at DESC LIMIT 500`)).rows
  const journal = (await db().query(`SELECT j.id, to_char(j.entry_date, 'YYYY-MM-DD') AS entry_date, j.account, j.debit::float AS debit, j.credit::float AS credit, j.currency, j.memo, e.name AS entity, j.deployment_id FROM finance.journal j LEFT JOIN core.entities e ON e.id = j.entity_id ORDER BY j.entry_date DESC, j.created_at DESC, j.debit DESC LIMIT 1000`)).rows
  const balances = (await db().query(`SELECT e.name AS entity, j.account, j.currency, sum(j.debit - j.credit)::float AS balance FROM finance.journal j LEFT JOIN core.entities e ON e.id = j.entity_id GROUP BY 1, 2, 3 ORDER BY 1, 2`)).rows
  const options = {
    entities: (await db().query("SELECT id, name FROM core.entities WHERE status <> 'dissolved' ORDER BY name")).rows,
    funds: (await db().query("SELECT f.id, e.name, f.structure, f.entity_id, f.currency FROM funds.funds f JOIN core.entities e ON e.id = f.entity_id ORDER BY e.name")).rows,
    loans: (await db().query("SELECT l.id, b.name AS borrower, l.reference, l.principal::float AS principal, l.currency, l.lender_entity_id FROM credit.loans l JOIN credit.borrowers b ON b.id = l.borrower_id WHERE l.status = 'active' ORDER BY b.name")).rows,
    applications: (await db().query("SELECT a.id, b.name AS company, b.contact_name, b.contact_email, a.amount::float AS amount, a.currency, a.terms FROM credit.applications a JOIN credit.borrowers b ON b.id = a.borrower_id WHERE a.status = 'approved' ORDER BY a.updated_at DESC")).rows,
    holdings: (await db().query("SELECT id, name, entity_id, meta->'founder' AS founder, currency FROM wealth.holdings WHERE section = 'venture' ORDER BY name")).rows,
    angels: (await db().query("SELECT id, name, email FROM funds.lps ORDER BY name")).rows,
    accounts: (await db().query("SELECT id, bank_name || ' · ' || coalesce(account_name, '') || coalesce(' •••' || last4, '') AS name, entity_id, currency FROM banking.accounts WHERE active ORDER BY bank_name")).rows }
  return { rows, journal, balances, options }
})
