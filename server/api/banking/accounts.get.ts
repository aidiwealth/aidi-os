// Accounts the person can see, with the latest statement's closing balance.
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'family')
  const r = await db().query(
    `SELECT a.id, a.entity_id, e.name AS entity, a.bank_name, a.account_name, a.last4, a.currency, a.kind, a.active,
            s.closing_balance::text AS balance, to_char(s.period_end, 'YYYY-MM-DD') AS as_of,
            (SELECT count(*)::int FROM banking.statements x WHERE x.account_id = a.id) AS statements,
            (SELECT bool_and(coalesce(x.continuity_ok, true)) FROM banking.statements x WHERE x.account_id = a.id) AS continuous
       FROM banking.accounts a JOIN core.entities e ON e.id = a.entity_id
       LEFT JOIN LATERAL (SELECT closing_balance, period_end FROM banking.statements WHERE account_id = a.id ORDER BY period_end DESC LIMIT 1) s ON true
      ORDER BY a.active DESC, e.name, a.bank_name`)
  return r.rows
})
