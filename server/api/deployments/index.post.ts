// Log money sent to a company: who paid (entity, fund), who received it (company, founder), how it was funded (Aidi
// and/or named angels), and post it to the books. Credit: books the loan from an approved application or marks an
// existing loan disbursed. Angel/venture fund: adds to the company's position (cost and co-investors).
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  const uuid = z.string().uuid().nullable().optional()
  const b = z.object({ delete_id: z.string().uuid().optional(),
    paid_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), source: z.enum(['credit', 'angel_fund', 'venture_fund', 'other']).optional(), paying_entity_id: uuid, fund_id: uuid, loan_id: uuid, application_id: uuid, holding_id: uuid,
    company: z.string().trim().max(200).optional(), founder_name: z.string().trim().max(200).optional(), founder_email: z.string().trim().max(254).optional(), amount: z.number().positive().optional(), currency: z.string().regex(/^[A-Z]{3}$/).optional(),
    instrument: z.string().trim().max(60).optional(), reference: z.string().trim().max(120).optional(), bank_account_id: uuid, notes: z.string().max(3000).optional(),
    funded_by: z.array(z.object({ type: z.enum(['aidi', 'angel']), lp_id: z.string().uuid().nullable().optional(), name: z.string().max(200).optional(), email: z.string().max(254).optional(), amount: z.number().positive() })).max(50).default([]) }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Check the details: ' + b.error.issues.map((i) => i.path.join('.')).join(', '))
  const d = b.data
  if (d.delete_id) { await db().query('DELETE FROM finance.deployments WHERE id = $1', [d.delete_id]); await audit({ event, actorUserId: user.userId, action: 'deployment.delete', objectType: 'deployment', objectId: d.delete_id }); return { ok: true } }
  if (!d.paid_on || !d.source || !d.amount || !d.currency || !d.company) throw apiError('invalid', 'Add the date, source, company, amount and currency.')
  const funded = d.funded_by.length ? d.funded_by : [{ type: 'aidi' as const, amount: d.amount }]
  const sum = funded.reduce((s, f) => s + f.amount, 0)
  if (Math.abs(sum - d.amount) > 0.01) throw apiError('invalid', 'The funding lines add up to ' + sum.toLocaleString('en-US') + ', not ' + d.amount.toLocaleString('en-US') + '.')
  for (const f of funded) if (f.type === 'angel' && f.lp_id) { const lp = (await db().query<{ name: string; email: string | null }>('SELECT name, email FROM funds.lps WHERE id = $1', [f.lp_id])).rows[0]; if (lp) { f.name = f.name || lp.name; f.email = f.email || lp.email || undefined } }
  if (!d.paying_entity_id && d.fund_id) d.paying_entity_id = (await db().query<{ entity_id: string }>('SELECT entity_id FROM funds.funds WHERE id = $1', [d.fund_id])).rows[0]?.entity_id ?? null
  let loanId = d.loan_id ?? null, holdingId = d.holding_id ?? null
  // credit: book the loan from an approved application
  if (d.source === 'credit' && !loanId && d.application_id) {
    const a = (await db().query<{ borrower_id: string; terms: { principal?: number; annual_rate?: number; tenor_months?: number; repayment_type?: string; lender_entity_id?: string | null } }>("SELECT borrower_id, terms FROM credit.applications WHERE id = $1 AND status = 'approved'", [d.application_id])).rows[0]
    if (!a) throw apiError('invalid', 'That application is not approved yet.')
    const t = { principal: d.amount, annual_rate: Number(a.terms.annual_rate ?? 24), tenor_months: Number(a.terms.tenor_months ?? 12), repayment_type: a.terms.repayment_type ?? 'amortising', frequency: 'monthly', disbursed_on: d.paid_on, first_payment_on: new Date(new Date(d.paid_on + 'T00:00:00Z').getTime() + 31 * 86400e3).toISOString().slice(0, 10) }
    const sched = buildSchedule(t)
    loanId = (await one<{ id: string }>('INSERT INTO credit.loans (borrower_id, lender_entity_id, reference, principal, currency, annual_rate, tenor_months, repayment_type, frequency, disbursed_on, first_payment_on, notes, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id',
      [a.borrower_id, d.paying_entity_id ?? a.terms.lender_entity_id ?? null, d.reference || null, d.amount, d.currency, t.annual_rate, t.tenor_months, t.repayment_type, 'monthly', d.paid_on, t.first_payment_on, 'Booked from loan application on disbursement.', user.userId])).id
    for (const r of sched) await db().query('INSERT INTO credit.schedule (loan_id, seq, due_date, principal_due, interest_due) VALUES ($1,$2,$3,$4,$5)', [loanId, r.seq, r.due_date, r.principal_due, r.interest_due])
    await db().query("UPDATE credit.applications SET status = 'disbursed', loan_id = $2, updated_at = now() WHERE id = $1", [d.application_id, loanId])
  }
  // angel / venture fund: add to the company's position
  if ((d.source === 'angel_fund' || d.source === 'venture_fund') && !holdingId) {
    const fundEntity = d.fund_id ? (await db().query<{ entity_id: string }>('SELECT entity_id FROM funds.funds WHERE id = $1', [d.fund_id])).rows[0]?.entity_id : d.paying_entity_id
    holdingId = (await one<{ id: string }>("INSERT INTO wealth.holdings (entity_id, section, category, name, currency, cost, current_value, status, as_of, meta, in_nav, in_aum, created_by) VALUES ($1,'venture','venture',$2,$3,0,0,'active',$4,$5,true,true,$6) RETURNING id",
      [fundEntity ?? null, d.company, d.currency, d.paid_on, JSON.stringify({ instrument: d.instrument ?? null, founder: d.founder_name ? { name: d.founder_name, email: d.founder_email ?? null } : undefined, co_investors: [] }), user.userId])).id
  }
  if (holdingId && (d.source === 'angel_fund' || d.source === 'venture_fund')) {
    const angels = funded.filter((f) => f.type === 'angel').map((f) => ({ name: f.name ?? 'Angel', email: f.email ?? null, amount: f.amount }))
    await db().query(`UPDATE wealth.holdings SET cost = coalesce(cost, 0) + $2, current_value = coalesce(current_value, 0) + $2, status = CASE WHEN status IN ('nil','at_cost') THEN 'active' ELSE status END,
        meta = jsonb_set(meta, '{co_investors}', coalesce(meta->'co_investors', '[]'::jsonb) || $3::jsonb), updated_at = now() WHERE id = $1`, [holdingId, d.amount, JSON.stringify(angels)])
  }
  const dep = await one<{ id: string }>(`INSERT INTO finance.deployments (paid_on, source, paying_entity_id, fund_id, loan_id, application_id, holding_id, company, founder_name, founder_email, amount, currency, instrument, reference, bank_account_id, funded_by, notes, created_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING id`,
    [d.paid_on, d.source, d.paying_entity_id ?? null, d.fund_id ?? null, loanId, d.application_id ?? null, holdingId, d.company, d.founder_name || null, d.founder_email || null, d.amount, d.currency, d.instrument || null, d.reference || null, d.bank_account_id ?? null, JSON.stringify(funded), d.notes || null, user.userId])
  // books (double entry, on the paying entity): Dr investment / loan receivable, Cr cash; angel money in: Dr cash, Cr co-investor capital
  const asset = d.source === 'credit' ? 'Loans receivable' : d.source === 'other' ? 'Other investments' : 'Investments at cost'
  const memo = (d.source === 'credit' ? 'Loan disbursed to ' : 'Investment in ') + d.company + (d.instrument ? ' (' + d.instrument + ')' : '') + (d.reference ? ' · ' + d.reference : '')
  const post = (account: string, debit: number, credit: number, m: string) => db().query('INSERT INTO finance.journal (entity_id, entry_date, account, debit, credit, currency, memo, deployment_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [d.paying_entity_id ?? null, d.paid_on, account, debit, credit, d.currency, m, dep.id])
  for (const f of funded.filter((x) => x.type === 'angel')) { await post('Cash at bank', f.amount, 0, 'Co-investment received from ' + (f.name ?? 'angel') + ' for ' + d.company); await post('Co-investor capital', 0, f.amount, 'Co-investment from ' + (f.name ?? 'angel') + ' for ' + d.company) }
  await post(asset, d.amount, 0, memo); await post('Cash at bank', 0, d.amount, memo)
  await audit({ event, actorUserId: user.userId, action: 'deployment.log', objectType: 'deployment', objectId: dep.id, detail: { source: d.source, amount: d.amount, currency: d.currency } })
  return { ok: true, id: dep.id, loan_id: loanId, holding_id: holdingId }
})
