// Book a loan; its repayment schedule is generated from the terms and saved with it.
import { z } from 'zod'
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const Body = z.object({
  borrower_id: z.string().uuid(), lender_entity_id: z.string().uuid().optional().or(z.literal('').transform(() => undefined)),
  reference: z.string().trim().max(60).optional(), principal: z.coerce.number().positive().max(1e12), currency: z.string().regex(/^[A-Z]{3}$/),
  annual_rate: z.coerce.number().min(0).max(200), tenor_months: z.coerce.number().int().min(1).max(360),
  repayment_type: z.enum(['amortising', 'interest_only', 'bullet']), frequency: z.enum(['monthly', 'quarterly']),
  disbursed_on: date, first_payment_on: date, security: z.string().trim().max(1000).optional(), notes: z.string().trim().max(3000).optional()
})
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'team')
  const b = Body.safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Fill in the borrower, amount, currency, rate, tenor, repayment terms and dates.')
  const d = b.data
  if (d.first_payment_on <= d.disbursed_on) throw apiError('invalid', 'The first payment must be after disbursement.')
  const schedule = buildSchedule(d)
  const client = await db().connect()
  let loanId: string
  try {
    await client.query('BEGIN')
    const l = await client.query<{ id: string }>(
      `INSERT INTO credit.loans (borrower_id, lender_entity_id, reference, principal, currency, annual_rate, tenor_months, repayment_type, frequency, disbursed_on, first_payment_on, security, notes, created_by)
       VALUES ($1, coalesce($2::uuid, (SELECT id FROM core.entities WHERE name = 'Aidi Ventures Fund I')), $3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
      [d.borrower_id, d.lender_entity_id ?? null, d.reference || null, d.principal, d.currency, d.annual_rate, d.tenor_months, d.repayment_type, d.frequency, d.disbursed_on, d.first_payment_on, d.security || null, d.notes || null, user.userId])
    loanId = l.rows[0]!.id
    for (const r of schedule) await client.query('INSERT INTO credit.schedule (loan_id, seq, due_date, principal_due, interest_due) VALUES ($1,$2,$3,$4,$5)', [loanId, r.seq, r.due_date, r.principal_due, r.interest_due])
    await client.query('INSERT INTO core.audit_log (actor_user_id, action, object_type, object_id, detail, ip) VALUES ($1,$2,$3,$4,$5,$6)',
      [user.userId, 'credit.loan_book', 'loan', loanId, JSON.stringify({ principal: d.principal, currency: d.currency, rate: d.annual_rate, instalments: schedule.length }), getRequestIP(event, { xForwardedFor: true }) ?? null])
    await client.query('COMMIT')
  } catch (err) { await client.query('ROLLBACK'); throw err } finally { client.release() }
  return { ok: true, id: loanId }
})
