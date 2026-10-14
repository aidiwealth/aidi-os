// Money lent out and recorded from the bank (Deployments, source "credit") that is not set up as a loan yet: book it
// as a loan so it gets a schedule, repayments and arrears. Only the companies this person can see.
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team')
  return (await db().query(`SELECT d.id, to_char(d.paid_on, 'YYYY-MM-DD') AS paid_on, d.company, d.founder_name, d.amount::float AS amount, d.currency, d.reference, d.paying_entity_id, e.name AS entity,
      a.bank_name || coalesce(' ····' || a.last4, '') AS account
    FROM finance.deployments d LEFT JOIN core.entities e ON e.id = d.paying_entity_id LEFT JOIN banking.accounts a ON a.id = d.bank_account_id
    WHERE d.source = 'credit' AND d.loan_id IS NULL ORDER BY d.paid_on DESC LIMIT 100`)).rows
})
