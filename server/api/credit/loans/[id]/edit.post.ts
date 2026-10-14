// Edit a loan: who lent it (the company it was paid from), reference, security, notes, and — while no repayment has
// been recorded — its terms (the schedule is rebuilt from them). Every change is logged.
import { z } from 'zod'
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const Body = z.object({
  lender_entity_id: z.string().uuid().nullable().optional(), reference: z.string().trim().max(60).optional(), security: z.string().trim().max(1000).optional(), notes: z.string().trim().max(3000).optional(),
  borrower_id: z.string().uuid().optional(), principal: z.coerce.number().positive().max(1e12).optional(), currency: z.string().regex(/^[A-Z]{3}$/).optional(),
  annual_rate: z.coerce.number().min(0).max(200).optional(), tenor_months: z.coerce.number().int().min(1).max(360).optional(),
  repayment_type: z.enum(['amortising', 'interest_only', 'bullet']).optional(), frequency: z.enum(['monthly', 'quarterly']).optional(), disbursed_on: date.optional(), first_payment_on: date.optional()
})
type L = { principal: string; currency: string; annual_rate: string; tenor_months: number; repayment_type: string; frequency: string; disbursed_on: string; first_payment_on: string; borrower_id: string; lender_entity_id: string | null }
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'team')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  const b = Body.safeParse(await readBody(event))
  if (!id.success || !b.success) throw apiError('invalid', 'Check the loan details.')
  const d = b.data
  const cur = (await db().query<L>("SELECT principal::text, currency, annual_rate::text, tenor_months, repayment_type, frequency, to_char(disbursed_on, 'YYYY-MM-DD') AS disbursed_on, to_char(first_payment_on, 'YYYY-MM-DD') AS first_payment_on, borrower_id, lender_entity_id FROM credit.loans WHERE id = $1", [id.data])).rows[0]
  if (!cur) throw apiError('not_found', 'Loan not found', 404)
  if (d.lender_entity_id && !(await db().query('SELECT 1 FROM core.entities WHERE id = $1', [d.lender_entity_id])).rowCount) throw apiError('invalid', 'Choose the company the loan was paid from.')
  if (d.borrower_id && !(await db().query('SELECT 1 FROM credit.borrowers WHERE id = $1', [d.borrower_id])).rowCount) throw apiError('invalid', 'Choose a borrower.')
  const t = { principal: d.principal ?? Number(cur.principal), currency: d.currency ?? cur.currency, annual_rate: d.annual_rate ?? Number(cur.annual_rate), tenor_months: d.tenor_months ?? cur.tenor_months, repayment_type: d.repayment_type ?? cur.repayment_type, frequency: d.frequency ?? cur.frequency, disbursed_on: d.disbursed_on ?? cur.disbursed_on, first_payment_on: d.first_payment_on ?? cur.first_payment_on }
  const termsChanged = t.principal !== Number(cur.principal) || t.currency !== cur.currency || t.annual_rate !== Number(cur.annual_rate) || t.tenor_months !== cur.tenor_months || t.repayment_type !== cur.repayment_type || t.frequency !== cur.frequency || t.disbursed_on !== cur.disbursed_on || t.first_payment_on !== cur.first_payment_on
  if (termsChanged) {
    if ((await db().query('SELECT 1 FROM credit.repayments WHERE loan_id = $1 LIMIT 1', [id.data])).rowCount) throw apiError('state', 'Repayments are already recorded on this loan, so its terms cannot change. Mark it restructured and book the new terms as a new loan.', 409)
    if (t.first_payment_on <= t.disbursed_on) throw apiError('invalid', 'The first payment must be after disbursement.')
  }
  const client = await db().connect()
  try {
    await client.query('BEGIN')
    await client.query(`UPDATE credit.loans SET lender_entity_id = CASE WHEN $2::boolean THEN $3::uuid ELSE lender_entity_id END, reference = coalesce($4, reference), security = coalesce($5, security), notes = coalesce($6, notes), borrower_id = coalesce($7::uuid, borrower_id),
        principal = $8, currency = $9, annual_rate = $10, tenor_months = $11, repayment_type = $12, frequency = $13, disbursed_on = $14, first_payment_on = $15 WHERE id = $1`,
      [id.data, d.lender_entity_id !== undefined, d.lender_entity_id ?? null, d.reference === undefined ? null : d.reference || null, d.security ?? null, d.notes ?? null, d.borrower_id ?? null, t.principal, t.currency, t.annual_rate, t.tenor_months, t.repayment_type, t.frequency, t.disbursed_on, t.first_payment_on])
    if (termsChanged) {
      await client.query('DELETE FROM credit.schedule WHERE loan_id = $1', [id.data])
      for (const r of buildSchedule(t)) await client.query('INSERT INTO credit.schedule (loan_id, seq, due_date, principal_due, interest_due) VALUES ($1,$2,$3,$4,$5)', [id.data, r.seq, r.due_date, r.principal_due, r.interest_due])
    }
    await client.query('COMMIT')
  } catch (err) { await client.query('ROLLBACK'); throw err } finally { client.release() }
  await audit({ event, actorUserId: user.userId, action: 'credit.loan_edit', objectType: 'loan', objectId: id.data, detail: { lender_from: cur.lender_entity_id, lender_to: d.lender_entity_id, terms: termsChanged } })
  return { ok: true, rescheduled: termsChanged }
})
