// Create a client invoice: US (USD, Aidi Ventures LLC) or Nigeria (NGN, Aidi Technology Limited). Optionally send it.
import { z } from 'zod'
const Body = z.object({
  client_id: z.string().uuid(), company_id: z.string().uuid().optional().or(z.literal('').transform(() => undefined)), job_id: z.string().uuid().optional().or(z.literal('').transform(() => undefined)),
  region: z.enum(['us', 'ng']), issue_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('').transform(() => undefined)), due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('').transform(() => undefined)),
  lines: z.array(z.object({ description: z.string().trim().min(1).max(300), quantity: z.coerce.number().positive().max(1e6), unit_amount: z.coerce.number().min(0).max(1e10) })).min(1).max(40),
  bill_to: z.object({ name: z.string().trim().min(1).max(200), email: z.string().trim().email().max(254), address: z.string().trim().max(500).optional() }),
  note: z.string().trim().max(1000).optional(), send: z.boolean().default(false)
})
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'team', 'gp')
  const b = Body.safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Choose the client, add at least one line, and a billing contact.')
  const d = b.data
  if (d.issue_date && d.issue_date > new Date().toISOString().slice(0, 10)) throw apiError('invalid', 'The invoice date cannot be in the future.')
  if (!(await db().query('SELECT 1 FROM services.clients WHERE id = $1', [d.client_id])).rowCount) throw apiError('invalid', 'Choose a client.')
  if (d.company_id && !(await db().query('SELECT 1 FROM services.companies WHERE id = $1 AND client_id = $2', [d.company_id, d.client_id])).rowCount) throw apiError('invalid', 'Choose one of this client\'s companies.')
  if (d.job_id && !(await db().query('SELECT 1 FROM services.jobs WHERE id = $1 AND client_id = $2', [d.job_id, d.client_id])).rowCount) throw apiError('invalid', 'That job belongs to another client.')
  const s = await csBilling()
  const reg = d.region === 'ng' ? s.ng : s.us
  const tx = await applyTax(d.lines.map((l) => ({ ...l, amount: Math.round(l.quantity * l.unit_amount * 100) / 100 })), taxCountry({ region: d.region }), 'services')
  const lines = tx.lines, amount = tx.amount
  const issued = d.issue_date ?? new Date().toISOString().slice(0, 10)
  const due = d.due_date ?? new Date(new Date(issued + 'T00:00:00Z').getTime() + s.terms_days * 86400000).toISOString().slice(0, 10)
  const r = await one<{ id: string; number: string }>(
    `INSERT INTO services.invoices (number, client_id, company_id, job_id, region, currency, due_date, lines, amount, bill_to, issuer, note, created_by, country, subtotal, tax_label, tax_rate, tax_amount, issue_date)
     VALUES ($1 || '-' || to_char(current_date, 'YYYY') || '-' || lpad(((SELECT coalesce(max(substring(number from '-([0-9]+)$')::int), 0) FROM services.invoices WHERE number LIKE $1 || '-' || to_char(current_date, 'YYYY') || '-%') + 1)::text, 4, '0'),
             $2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING id, number`,
    [s.prefix, d.client_id, d.company_id ?? null, d.job_id ?? null, d.region, regionCurrency(d.region), due, JSON.stringify(lines), amount, JSON.stringify({ ...d.bill_to, email: d.bill_to.email.toLowerCase() }),
      JSON.stringify({ ...reg, note_top: s.note_top, note_bottom: s.note_bottom }), d.note || null, user.userId, tx.country, tx.subtotal, tx.tax_label, tx.tax_rate, tx.tax_amount, issued])
  await audit({ event, actorUserId: user.userId, action: 'services.invoice_create', objectType: 'invoice', objectId: r.id, detail: { number: r.number, amount } })
  let emailed = false
  if (d.send) { try { emailed = await sendCsInvoice(r.id) } catch (err) { console.error('[cs] invoice email failed', err) } }
  return { ok: true, id: r.id, number: r.number, emailed }
})
