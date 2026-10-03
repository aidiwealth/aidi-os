// Invoices: loading one with its issuer details, and emailing it to the billing contact (in the customer's brand).
import type { H3Event } from 'h3'
export interface Invoice {
  id: string; number: string; organization_id: string; customer: string; issue_date: string; due_date: string; period_start: string | null; period_end: string | null
  currency: string; lines: { description: string; quantity: number; unit_amount: number; amount: number }[]; amount: string; bill_to: { name: string; email: string; address?: string }
  status: string; paid_at: string | null; overdue: boolean
}
export async function loadInvoice(id: string): Promise<Invoice | null> {
  const r = await asPlatform(() => db().query<Invoice>(
    `SELECT i.id, i.number, i.organization_id, o.name AS customer, to_char(i.issue_date, 'YYYY-MM-DD') AS issue_date, to_char(i.due_date, 'YYYY-MM-DD') AS due_date,
            to_char(i.period_start, 'YYYY-MM-DD') AS period_start, to_char(i.period_end, 'YYYY-MM-DD') AS period_end, i.currency, i.lines, i.amount::text, i.bill_to,
            i.status, to_char(i.paid_at, 'YYYY-MM-DD') AS paid_at, (i.status = 'sent' AND i.due_date < current_date) AS overdue
       FROM platform.invoices i JOIN core.organizations o ON o.id = i.organization_id WHERE i.id = $1`, [id]))
  return r.rows[0] ?? null
}
export async function sendInvoice(event: H3Event, staffUserId: string, id: string): Promise<boolean> {
  const inv = await loadInvoice(id)
  if (!inv) return false
  const s = await billingSettings()
  setOrgContext(inv.organization_id)
  let ok = false
  try { await sendInvoiceEmail(inv, s, { payUrl: providersFor(inv.currency).length && inv.status !== 'paid' ? await payUrl(inv.id, inv.organization_id) : undefined }); ok = true } catch (err) { console.error('[billing] invoice email failed for ' + inv.number, err) }
  setOrgContext(null)
  if (ok) {
    await asPlatform(() => db().query("UPDATE platform.invoices SET status = CASE WHEN status = 'draft' THEN 'sent' ELSE status END, sent_at = now() WHERE id = $1", [id]))
    await platformAudit(event, staffUserId, 'invoice_send', inv.organization_id, { number: inv.number, to: inv.bill_to.email })
  }
  return ok
}
