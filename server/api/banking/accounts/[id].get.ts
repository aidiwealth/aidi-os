// One account: statements (with tie-out figures), a balance series and recent transactions.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'family')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw apiError('not_found', 'Account not found', 404)
  const a = await db().query(`SELECT a.*, e.name AS entity FROM banking.accounts a JOIN core.entities e ON e.id = a.entity_id WHERE a.id = $1`, [id.data])
  if (a.rowCount !== 1) throw apiError('not_found', 'Account not found', 404)
  const levels = visibleLevels(user.roles)
  const st = await db().query(
    `SELECT s.id, to_char(s.period_start, 'YYYY-MM-DD') AS period_start, to_char(s.period_end, 'YYYY-MM-DD') AS period_end,
            s.opening_balance::text AS opening, s.closing_balance::text AS closing, s.credits_total::text AS credits, s.debits_total::text AS debits,
            s.txn_count, s.continuity_ok, s.source, s.created_at, p.full_name AS by_name,
            CASE WHEN d.sensitivity = ANY($2::text[]) THEN d.id END AS document_id
       FROM banking.statements s LEFT JOIN core.users u ON u.id = s.uploaded_by LEFT JOIN core.people p ON p.id = u.person_id
       LEFT JOIN core.documents d ON d.id = s.document_id WHERE s.account_id = $1 ORDER BY s.period_end DESC`, [id.data, levels])
  const tx = await db().query(
    `SELECT to_char(txn_date, 'YYYY-MM-DD') AS date, description, amount::text, balance::text FROM banking.transactions
      WHERE account_id = $1 ORDER BY txn_date DESC, id DESC LIMIT 300`, [id.data])
  return { account: a.rows[0], statements: st.rows, transactions: tx.rows }
})
