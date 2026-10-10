// Edit a client invoice that is not paid yet (draft or sent): lines (catalog services or free text, any price and
// quantity), country billed in, company, due date, billing contact and note. VAT is worked out again. Any online
// checkout started for the old amount is cancelled; optionally the corrected invoice is emailed again.
import { z } from 'zod'
const Line = z.object({ description: z.string().trim().min(1).max(300), quantity: z.coerce.number().positive().max(1e6), unit_amount: z.coerce.number().min(0).max(1e10),
  code: z.string().regex(/^[a-z][a-z0-9_]{1,40}$/).optional(), interval: z.enum(['month', 'year']).optional(), free_first_year: z.boolean().optional() })
const Body = z.object({
  company_id: z.string().uuid().optional().or(z.literal('').transform(() => undefined)), job_id: z.string().uuid().optional().or(z.literal('').transform(() => undefined)),
  region: z.enum(['us', 'ng']), due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('').transform(() => undefined)),
  lines: z.array(Line).min(1).max(40),
  bill_to: z.object({ name: z.string().trim().min(1).max(200), email: z.string().trim().email().max(254), address: z.string().trim().max(500).optional() }),
  note: z.string().trim().max(1000).optional(), send: z.boolean().default(false)
})
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'team', 'gp')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  const b = Body.safeParse(await readBody(event))
  if (!id.success || !b.success) throw apiError('invalid', 'Add at least one line and a billing contact.')
  const inv = await loadCsInvoice(id.data)
  if (!inv) throw apiError('not_found', 'Invoice not found', 404)
  if (inv.status !== 'draft' && inv.status !== 'sent') throw apiError('state', 'Only unpaid invoices can be edited. This one is ' + inv.status + '.')
  const d = b.data
  if (d.company_id && !(await db().query('SELECT 1 FROM services.companies WHERE id = $1 AND client_id = $2', [d.company_id, inv.client_id])).rowCount) throw apiError('invalid', 'Choose one of this client\'s companies.')
  if (d.job_id && !(await db().query('SELECT 1 FROM services.jobs WHERE id = $1 AND client_id = $2', [d.job_id, inv.client_id])).rowCount) throw apiError('invalid', 'That job belongs to another client.')
  const s = await csBilling()
  const tx = await applyTax(d.lines.map((l) => ({ ...l, amount: Math.round(l.quantity * l.unit_amount * 100) / 100 })), taxCountry({ region: d.region }), 'services')
  const issuer = inv.region === d.region ? inv.issuer : { ...(d.region === 'ng' ? s.ng : s.us), note_top: s.note_top, note_bottom: s.note_bottom }
  await db().query(`UPDATE services.invoices SET company_id = $2, job_id = $3, region = $4, currency = $5, due_date = coalesce($6::date, due_date), lines = $7, amount = $8, bill_to = $9, issuer = $10, note = $11,
      country = $12, subtotal = $13, tax_label = $14, tax_rate = $15, tax_amount = $16 WHERE id = $1 AND status IN ('draft','sent')`,
    [id.data, d.company_id ?? null, d.job_id ?? null, d.region, regionCurrency(d.region), d.due_date ?? null, JSON.stringify(tx.lines), tx.amount, JSON.stringify({ ...d.bill_to, email: d.bill_to.email.toLowerCase() }),
      JSON.stringify(issuer), d.note || null, tx.country, tx.subtotal, tx.tax_label, tx.tax_rate, tx.tax_amount])
  // a checkout opened for the old amount must not settle the new one
  await db().query("UPDATE services.invoice_payments SET status = 'failed' WHERE invoice_id = $1 AND status = 'pending'", [id.data])
  await audit({ event, actorUserId: user.userId, action: 'services.invoice_edit', objectType: 'invoice', objectId: id.data, detail: { number: inv.number, before: Number(inv.amount), after: tx.amount } })
  let emailed = false
  if (d.send) { try { emailed = await sendCsInvoice(id.data) } catch (err) { console.error('[cs] invoice email failed', err) } }
  return { ok: true, id: id.data, emailed, amount: tx.amount }
})
