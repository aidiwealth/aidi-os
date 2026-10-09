// Create an invoice for a customer: numbered, with line items, billed to a named contact. Optionally send it straight away.
import { z } from 'zod'
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const Body = z.object({
  organization_id: z.string().uuid(), subscription_id: z.string().uuid().optional().or(z.literal('').transform(() => undefined)),
  issue_date: date, due_date: date, period_start: date.optional().or(z.literal('').transform(() => undefined)), period_end: date.optional().or(z.literal('').transform(() => undefined)),
  lines: z.array(z.object({ description: z.string().trim().min(1).max(300), quantity: z.coerce.number().min(0).max(1e6), unit_amount: z.coerce.number().min(0).max(1e8) })).min(1).max(30),
  bill_to: z.object({ name: z.string().trim().min(1).max(200), email: z.string().trim().email().max(254), address: z.string().trim().max(500).optional() }),
  send: z.boolean().default(false),
  currency: z.enum(['USD', 'NGN']).default('USD')
})
export default defineEventHandler(async (event) => {
  const staff = await requirePlatform(event, true)
  const b = Body.safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Check the customer, dates, line items and billing contact.')
  const d = b.data
  if (d.due_date < d.issue_date) throw apiError('invalid', 'The due date is before the issue date.')
  const oc = (await asPlatform(() => db().query<{ country: string | null }>("SELECT settings->>'country' AS country FROM core.organizations WHERE id = $1", [d.organization_id]))).rows[0]
  const tx = await applyTax(d.lines.map((l) => ({ ...l, amount: Math.round(l.quantity * l.unit_amount * 100) / 100 })), taxCountry({ currency: d.currency, country: oc?.country }), 'platform')
  const lines = tx.lines, amount = tx.amount
  const s = await billingSettings()
  const inv = await asPlatform(async () => {
    if (!(await db().query('SELECT 1 FROM core.organizations WHERE id = $1', [d.organization_id])).rowCount) throw apiError('not_found', 'Customer not found', 404)
    const r = await db().query<{ id: string; number: string }>(
      `INSERT INTO platform.invoices (number, organization_id, subscription_id, issue_date, due_date, period_start, period_end, lines, amount, bill_to, created_by, currency, country, subtotal, tax_label, tax_rate, tax_amount)
       VALUES ($1 || '-' || to_char($4::date, 'YYYY') || '-' || lpad(nextval('platform.invoice_number_seq')::text, 4, '0'), $2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id, number`,
      [s.invoice_prefix || 'FIN', d.organization_id, d.subscription_id ?? null, d.issue_date, d.due_date, d.period_start ?? null, d.period_end ?? null, JSON.stringify(lines), amount, JSON.stringify({ ...d.bill_to, email: d.bill_to.email.toLowerCase() }), staff.userId, d.currency, tx.country, tx.subtotal, tx.tax_label, tx.tax_rate, tx.tax_amount])
    return r.rows[0]!
  })
  await platformAudit(event, staff.userId, 'invoice_create', d.organization_id, { number: inv.number, amount })
  let emailed = false
  if (d.send) emailed = await sendInvoice(event, staff.userId, inv.id)
  return { ok: true, id: inv.id, number: inv.number, emailed }
})
