// Log (or remove) a pay run for a person (admins). Optionally also record it under Payments, with a payment voucher.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireTeamManager(event)
  const b = z.object({ id: z.string().uuid().optional(), delete: z.boolean().optional(), bank_txn_id: z.string().uuid().nullable().optional(), person_id: z.string().uuid().optional(), period: z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/).optional(), amount: z.coerce.number().positive().max(1e10).optional(),
    currency: z.string().regex(/^[A-Z]{3}$/).optional(), paid_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), method: z.string().trim().max(60).default(''), reference: z.string().trim().max(120).default(''), notes: z.string().trim().max(1000).default(''),
    record_payment: z.boolean().default(true), category: z.string().max(60).default('Salaries & contractors') }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Check the payment details.')
  const d = b.data
  if (d.id && d.delete) { await db().query('DELETE FROM hr.payments WHERE id = $1', [d.id]); return { ok: true } }
  // Link a logged payment to the bank line that paid it (or unlink with null).
  if (d.id && d.bank_txn_id !== undefined) {
    if (d.bank_txn_id && (await db().query('SELECT 1 FROM hr.payments WHERE bank_txn_id = $1 AND id <> $2', [d.bank_txn_id, d.id])).rowCount) throw apiError('duplicate', 'That bank line is already linked to another payment.', 409)
    await db().query('UPDATE hr.payments SET bank_txn_id = $2 WHERE id = $1', [d.id, d.bank_txn_id])
    await audit({ event, actorUserId: user.userId, action: d.bank_txn_id ? 'hr.payment_bank_linked' : 'hr.payment_bank_unlinked', objectType: 'hr_payment', objectId: d.id, detail: {} })
    return { ok: true }
  }
  if (!d.person_id || !d.period || !d.amount || !d.currency || !d.paid_on) throw apiError('invalid', 'Add the period, amount and date paid.')
  const p = (await db().query<{ name: string; kind: string; entity_id: string | null; entity: string | null; title: string | null }>('SELECT p.name, p.kind, p.entity_id, e.name AS entity, p.title FROM hr.people p LEFT JOIN core.entities e ON e.id = p.entity_id WHERE p.id = $1', [d.person_id])).rows[0]
  if (!p) throw apiError('not_found', 'Person not found', 404)
  if ((await db().query('SELECT 1 FROM hr.payments WHERE person_id = $1 AND period = $2', [d.person_id, d.period])).rowCount) throw apiError('duplicate', 'A payment for ' + d.period + ' is already logged for ' + p.name + '.', 409)
  let expenseId: string | null = null
  if (d.record_payment) {
    const n = Number((await db().query<{ n: string }>("SELECT count(*) AS n FROM finance.expenses WHERE paid_on >= date_trunc('year', $1::date)", [d.paid_on])).rows[0]?.n ?? 0) + 1
    const number = 'PV-' + d.paid_on.slice(0, 4) + '-' + String(n).padStart(4, '0')
    const desc = (p.kind === 'employee' || p.kind === 'intern' ? 'Salary' : 'Fees') + ' for ' + d.period + (p.title ? ' · ' + p.title : '') + (d.notes ? ' · ' + d.notes : '')
    const by = (await db().query<{ name: string }>('SELECT p.full_name AS name FROM core.users u JOIN core.people p ON p.id = u.person_id WHERE u.id = $1', [user.userId])).rows[0]?.name ?? user.email
    const voucher = await storePdf(await voucherPdf({ number, paid_on: d.paid_on, entity: p.entity, payee: p.name, category: d.category, description: desc, amount: d.amount, currency: d.currency, method: d.method || null, account: null, reference: d.reference || null, by }), 'Payment voucher ' + number, p.entity_id)
    expenseId = (await one<{ id: string }>('INSERT INTO finance.expenses (number, paid_on, entity_id, payee, category, description, amount, currency, method, reference, voucher_id, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id',
      [number, d.paid_on, p.entity_id, p.name, d.category, desc, d.amount, d.currency, d.method || null, d.reference || null, voucher, user.userId])).id
  }
  const id = (await one<{ id: string }>('INSERT INTO hr.payments (person_id, period, amount, currency, paid_on, method, reference, expense_id, notes, created_by, bank_txn_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id', [d.person_id, d.period, d.amount, d.currency, d.paid_on, d.method || null, d.reference || null, expenseId, d.notes || null, user.userId, d.bank_txn_id ?? null])).id
  await audit({ event, actorUserId: user.userId, action: 'hr.payment_logged', objectType: 'hr_payment', objectId: id, detail: { amount: d.amount, currency: d.currency, period: d.period } })
  return { ok: true, id, expense_id: expenseId }
})
