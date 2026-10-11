// Wealth invoices written by the team: line items, the contracting entity, currency, dates and how the client pays.
// Stored as wm.fees (kind 'invoice') so numbering, the PDF, online payment, receipts and the books work as for other fees.
import { z } from 'zod'
const D = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
export const WmInvoiceBody = z.object({
  client_id: z.string().uuid(), entity_id: z.string().uuid(), currency: z.enum(['USD', 'NGN']), method: z.enum(['online', 'transfer']).default('transfer'),
  issue_date: D.optional().or(z.literal('').transform(() => undefined)), due_date: D.optional().or(z.literal('').transform(() => undefined)),
  lines: z.array(z.object({ description: z.string().trim().min(1).max(300), quantity: z.coerce.number().positive().max(1e6), unit_amount: z.coerce.number().min(0).max(1e10) })).min(1).max(40),
  bill_to: z.object({ name: z.string().trim().min(1).max(200), email: z.string().trim().max(254).default(''), address: z.string().trim().max(500).default('') }).optional(),
  note: z.string().trim().max(1000).default(''), send: z.boolean().default(false)
})
export type WmInvoiceInput = z.infer<typeof WmInvoiceBody>
const today = () => new Date().toISOString().slice(0, 10)
const addDays = (d: string, n: number) => new Date(new Date(d + 'T00:00:00Z').getTime() + n * 864e5).toISOString().slice(0, 10)

export async function saveWmInvoice(id: string | null, d: WmInvoiceInput): Promise<string> {
  const c = (await db().query<{ country: string | null; name: string }>('SELECT country, name FROM wm.clients WHERE id = $1', [d.client_id])).rows[0]
  if (!c) throw apiError('invalid', 'Choose a client.')
  if (!(await db().query('SELECT 1 FROM core.entities WHERE id = $1', [d.entity_id])).rowCount) throw apiError('invalid', 'Choose the contracting entity.')
  const issued = d.issue_date ?? today()
  if (issued > today()) throw apiError('invalid', 'The invoice date cannot be in the future.')
  const due = d.due_date ?? addDays(issued, 14)
  if (due < issued) throw apiError('invalid', 'The due date must be on or after the invoice date.')
  const tx = await applyTax(d.lines.map((l) => ({ ...l, amount: Math.round(l.quantity * l.unit_amount * 100) / 100 })), taxCountry({ currency: d.currency, country: c.country }), 'wealth')
  const vals = [d.client_id, d.entity_id, d.currency, d.method, issued, due, JSON.stringify(tx.lines), tx.amount, tx.subtotal, tx.tax_label, tx.tax_rate, tx.tax_amount, tx.country, d.note || null, d.bill_to ? JSON.stringify(d.bill_to) : null]
  if (id) {
    const cur = (await db().query<{ status: string; kind: string }>('SELECT status, kind FROM wm.fees WHERE id = $1', [id])).rows[0]
    if (!cur || cur.kind !== 'invoice') throw apiError('not_found', 'Invoice not found.', 404)
    if (cur.status !== 'draft' && cur.status !== 'due') throw apiError('state', 'Only unpaid invoices can be edited.')
    await db().query(`UPDATE wm.fees SET client_id = $2, entity_id = $3, currency = $4, method = $5, issue_date = $6, due_date = $7, lines = $8, amount = $9, subtotal = $10, tax_label = $11, tax_rate = $12, tax_amount = $13, country = $14, note = $15, bill_to = $16, pay_ref = NULL WHERE id = $1`, [id, ...vals])
    return id
  }
  return (await one<{ id: string }>(`INSERT INTO wm.fees (kind, status, client_id, entity_id, currency, method, issue_date, due_date, lines, amount, subtotal, tax_label, tax_rate, tax_amount, country, note, bill_to)
    VALUES ('invoice', 'draft', $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`, vals)).id
}

// The invoice as the shared invoice layout expects it (Aidi logo), plus what the admin page needs.
export async function wmInvoiceView(id: string) {
  const f = (await db().query<{ id: string; number: string | null; kind: string; period: string | null; amount: string; subtotal: string | null; tax_amount: string | null; tax_label: string | null; tax_rate: string | null; currency: string; status: string; paid_on: string | null; due_date: string | null; issue_date: string; method: string | null; lines: { description: string; quantity: number; unit_amount: number; amount: number; kind?: string }[] | null; note: string | null; bill_to: { name: string; email?: string; address?: string } | null; client_id: string | null; client: string | null; email: string | null; country: string | null; entity_id: string | null; entity: string | null; entity_address: string | null; invoice_doc_id: string | null; receipt_doc_id: string | null }>(
    `SELECT f.id, f.number, f.kind, f.period, f.amount::text, f.subtotal::text, f.tax_amount::text, f.tax_label, f.tax_rate::text, f.currency, f.status, to_char(f.paid_on, 'YYYY-MM-DD') AS paid_on, to_char(f.due_date, 'YYYY-MM-DD') AS due_date,
            to_char(coalesce(f.issue_date, f.created_at::date), 'YYYY-MM-DD') AS issue_date, f.method, f.lines, f.note, f.bill_to, f.client_id, c.name AS client, c.email, coalesce(c.country, f.country) AS country,
            coalesce(f.entity_id, c.entity_id) AS entity_id, e.name AS entity, e.address AS entity_address, f.invoice_doc_id, f.receipt_doc_id
       FROM wm.fees f LEFT JOIN wm.clients c ON c.id = f.client_id LEFT JOIN core.entities e ON e.id = coalesce(f.entity_id, c.entity_id) WHERE f.id = $1`, [id])).rows[0]
  if (!f) return null
  const lines = f.lines?.length ? f.lines : [{ description: (f.kind === 'subscription' ? 'Aidi Wealth subscription' : f.kind === 'advisory' ? 'Advisory fee' : 'Referral fee') + (f.period ? ' · ' + f.period : ''), quantity: 1, unit_amount: Number(f.subtotal ?? f.amount), amount: Number(f.subtotal ?? f.amount) },
    ...(Number(f.tax_amount) > 0 ? [{ description: (f.tax_label ?? 'VAT') + ' (' + Number(f.tax_rate) + '%)', quantity: 1, unit_amount: Number(f.tax_amount), amount: Number(f.tax_amount), kind: 'tax' }] : [])]
  const b = ((await wmSettings()) as unknown as { banks?: Record<string, Record<string, string>> }).banks?.[f.currency === 'NGN' ? 'NG' : 'US'] ?? {}
  const bank = f.method === 'transfer' ? Object.fromEntries(Object.entries({ Bank: b.bank, 'Account name': b.account_name, 'Account number': b.account_number, 'Routing (ACH)': b.routing, 'Wire / SWIFT': b.swift }).filter(([, v]) => v)) as Record<string, string> : {}
  return {
    id: f.id, kind: f.kind, client_id: f.client_id, entity_id: f.entity_id, method: f.method, invoice_doc_id: f.invoice_doc_id, receipt_doc_id: f.receipt_doc_id, raw_status: f.status,
    pay_link: f.method === 'online' && f.status === 'due' ? brands().aidi.url + '/wpay/' + wmPayToken(f.id) : null,
    invoice: { number: f.number ?? 'Draft', currency: f.currency, amount: f.amount, issue_date: f.issue_date, due_date: f.due_date ?? f.issue_date, status: f.status === 'due' ? 'sent' : f.status === 'waived' ? 'void' : f.status, paid_at: f.paid_on,
      lines, bill_to: { name: f.bill_to?.name || f.client || '', email: f.bill_to?.email || f.email || '', address: f.bill_to?.address || undefined },
      issuer: { issuer: f.entity ?? 'Aidi Wealth', address: f.entity_address ?? '', phone: '', email: '', bank }, note: f.note, brand: 'aidi' as const }
  }
}
