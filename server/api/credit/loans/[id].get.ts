import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'team')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw apiError('not_found', 'Loan not found', 404)
  const l = await db().query(
    `SELECT l.*, l.principal::text, l.annual_rate::text, to_char(l.disbursed_on, 'YYYY-MM-DD') AS disbursed_on, to_char(l.first_payment_on, 'YYYY-MM-DD') AS first_payment_on,
            b.name AS borrower, b.country, b.sector, b.contact_name, b.contact_email, e.name AS lender
       FROM credit.loans l JOIN credit.borrowers b ON b.id = l.borrower_id LEFT JOIN core.entities e ON e.id = l.lender_entity_id WHERE l.id = $1`, [id.data])
  const loan = l.rows[0]
  if (!loan) throw apiError('not_found', 'Loan not found', 404)
  const pos = await loadPosition(id.data, Number(loan.principal))
  const reps = await db().query(
    `SELECT r.id, to_char(r.received_on, 'YYYY-MM-DD') AS received_on, r.amount::text, r.note, p.full_name AS by_name
       FROM credit.repayments r LEFT JOIN core.users u ON u.id = r.created_by LEFT JOIN core.people p ON p.id = u.person_id WHERE r.loan_id = $1 ORDER BY r.received_on DESC, r.created_at DESC`, [id.data])
  const levels = visibleLevels(user.roles)
  const cov = await db().query(
    `SELECT c.id, c.title, c.kind, c.threshold, c.frequency, to_char(c.next_due, 'YYYY-MM-DD') AS next_due, c.active, (c.next_due - current_date)::int AS days_left,
            (SELECT json_agg(json_build_object('due_date', to_char(k.due_date, 'YYYY-MM-DD'), 'checked_on', to_char(k.checked_on, 'YYYY-MM-DD'), 'result', k.result, 'note', k.note,
                     'document_id', CASE WHEN d.sensitivity = ANY($2::text[]) THEN d.id END, 'document_title', d.title) ORDER BY k.due_date DESC)
               FROM credit.covenant_checks k LEFT JOIN core.documents d ON d.id = k.document_id WHERE k.covenant_id = c.id) AS checks
       FROM credit.covenants c WHERE c.loan_id = $1 ORDER BY c.active DESC, c.next_due`, [id.data, levels])
  const alloc = Object.fromEntries(pos.allocations.map((a) => [a.id, a]))
  return { loan, position: pos, repayments: reps.rows.map((r) => ({ ...r, allocation: alloc[r.id] ?? null })), covenants: cov.rows }
})
