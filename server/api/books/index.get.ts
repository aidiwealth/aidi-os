// Books: every journal entry posted by payments & expenses, deployments and wealth fees, with balances by account.
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin', 'gp')
  const q = getQuery(event), ent = typeof q.entity === 'string' && /^[0-9a-f-]{36}$/.test(q.entity) ? q.entity : null
  const from = typeof q.from === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(q.from) ? q.from : null, to = typeof q.to === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(q.to) ? q.to : null
  const where = 'WHERE ($1::uuid IS NULL OR j.entity_id = $1) AND ($2::date IS NULL OR j.entry_date >= $2) AND ($3::date IS NULL OR j.entry_date <= $3)'
  const rows = (await db().query(`SELECT j.id, to_char(j.entry_date, 'YYYY-MM-DD') AS entry_date, j.account, j.debit::float AS debit, j.credit::float AS credit, j.currency, j.memo, e.name AS entity,
      CASE WHEN j.expense_id IS NOT NULL THEN 'Payment' WHEN j.deployment_id IS NOT NULL THEN 'Deployment' WHEN j.wm_fee_id IS NOT NULL THEN 'Wealth fee' ELSE 'Manual' END AS source
    FROM finance.journal j LEFT JOIN core.entities e ON e.id = j.entity_id ${where} ORDER BY j.entry_date DESC, j.created_at DESC LIMIT 1000`, [ent, from, to])).rows
  const balances = (await db().query(`SELECT e.name AS entity, j.account, j.currency, sum(j.debit)::float AS debit, sum(j.credit)::float AS credit, sum(j.debit - j.credit)::float AS balance FROM finance.journal j LEFT JOIN core.entities e ON e.id = j.entity_id ${where} GROUP BY 1, 2, 3 ORDER BY 1, 2`, [ent, from, to])).rows
  const entities = (await db().query("SELECT id, name FROM core.entities WHERE status <> 'dissolved' ORDER BY name")).rows
  return { rows, balances, entities }
})
