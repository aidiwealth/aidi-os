// Client Services billing: settings (issuers and bank details per region), invoices, pay links and payments.
import { createHmac, timingSafeEqual } from 'node:crypto'
export interface CsRegion { issuer: string; address: string; phone: string; email: string; bank?: Record<string, string> }
export interface CsBilling { prefix: string; terms_days: number; note_top: string; note_bottom: string; us: CsRegion; ng: CsRegion }
export async function csBilling(): Promise<CsBilling> {
  const org = await currentOrg()
  const s = ((org?.settings as Record<string, unknown> | undefined)?.cs_billing ?? {}) as Partial<CsBilling>
  const blank: CsRegion = { issuer: org?.name ?? '', address: '', phone: '', email: '', bank: {} }
  return { prefix: s.prefix || 'INV', terms_days: s.terms_days ?? 30, note_top: s.note_top ?? '', note_bottom: s.note_bottom ?? '', us: { ...blank, ...(s.us ?? {}) }, ng: { ...blank, ...(s.ng ?? {}) } }
}
export const regionCurrency = (r: string) => (r === 'ng' ? 'NGN' : 'USD')

export function billToken(id: string): string { return id + '.' + createHmac('sha256', useRuntimeConfig().jwtSecret).update('bill:' + id).digest('base64url').slice(0, 32) }
export function billIdFromToken(token: string): string | null {
  const [id, sig] = token.split('.')
  if (!id || !sig || !/^[0-9a-f-]{36}$/.test(id)) return null
  const want = billToken(id).split('.')[1]!
  return sig.length === want.length && timingSafeEqual(Buffer.from(sig), Buffer.from(want)) ? id : null
}
export async function billUrl(id: string): Promise<string> { return (await appUrl()) + '/bill/' + billToken(id) }

export interface CsInvoice { id: string; number: string; client_id: string; client: string; company_id: string | null; company: string | null; region: string; currency: string; issue_date: string; due_date: string
  lines: { description: string; quantity: number; unit_amount: number; amount: number }[]; amount: string; bill_to: { name: string; email: string; address?: string }; issuer: CsRegion & { note_top?: string; note_bottom?: string }
  note: string | null; status: string; paid_at: string | null; paid_via: string | null; overdue: boolean; organization_id: string; job_id: string | null; job: string | null; country: string | null; subtotal: string | null; tax_amount: string | null }
export async function loadCsInvoice(id: string): Promise<CsInvoice | null> {
  const r = await db().query<CsInvoice>(
    `SELECT i.id, i.number, i.client_id, c.name AS client, i.company_id, co.name AS company, i.region, i.currency, to_char(i.issue_date, 'YYYY-MM-DD') AS issue_date, to_char(i.due_date, 'YYYY-MM-DD') AS due_date,
            i.lines, i.amount::text, i.bill_to, i.issuer, i.note, i.status, to_char(i.paid_at, 'YYYY-MM-DD') AS paid_at, i.paid_via, (i.status = 'sent' AND i.due_date < current_date) AS overdue, i.organization_id, i.job_id, (SELECT title FROM services.jobs WHERE id = i.job_id) AS job, i.country, i.subtotal::text, i.tax_amount::text
       FROM services.invoices i JOIN services.clients c ON c.id = i.client_id LEFT JOIN services.companies co ON co.id = i.company_id WHERE i.id = $1`, [id])
  return r.rows[0] ?? null
}
export async function sendCsInvoice(id: string): Promise<boolean> {
  const inv = await loadCsInvoice(id)
  if (!inv || inv.status === 'void' || inv.status === 'paid') return false
  const org = await currentOrg()
  const online = csProviders(inv.currency, org?.settings.brand).length > 0
  await sendClientInvoiceEmail(inv, await billUrl(inv.id), online)
  await db().query("UPDATE services.invoices SET status = CASE WHEN status = 'draft' THEN 'sent' ELSE status END, sent_at = now() WHERE id = $1", [id])
  return true
}
// A Stripe or Paystack payment for a client invoice completed (from the webhook, or Paystack's return).
export async function csPaymentSucceeded(reference: string): Promise<void> {
  const row = await asPlatform(async () => {
    const p = await db().query<{ invoice_id: string; organization_id: string; provider: string }>(
      "UPDATE services.invoice_payments SET status = 'succeeded', completed_at = now() WHERE reference = $1 AND status <> 'succeeded' RETURNING invoice_id, organization_id, provider", [reference])
    if (!p.rows[0]) return null
    await db().query("UPDATE services.invoices SET status = 'paid', paid_at = current_date, paid_via = $2 WHERE id = $1 AND status IN ('draft','sent')", [p.rows[0].invoice_id, p.rows[0].provider])
    await db().query("UPDATE services.clients SET status = 'active' WHERE status = 'lead' AND id = (SELECT client_id FROM services.invoices WHERE id = $1)", [p.rows[0].invoice_id])
    await db().query("INSERT INTO core.audit_log (organization_id, action, object_type, object_id, detail) VALUES ($1, 'services.invoice_paid', 'invoice', $2, $3)", [p.rows[0].organization_id, p.rows[0].invoice_id, JSON.stringify({ provider: p.rows[0].provider })])
    return p.rows[0]
  })
  if (!row) return
  await subscriptionsFromInvoice(row.invoice_id).catch((e) => console.error('[cs] renewals failed', e))
  setOrgContext(row.organization_id)
  const inv = await loadCsInvoice(row.invoice_id)
  if (inv) { try { await sendClientReceiptEmail(inv) } catch (err) { console.error('[cs] receipt failed', err) } }
  setOrgContext(null)
}

// A client's Finvry wallet (if they have a workspace), for showing next to their invoices and jobs.
export async function clientWallet(clientId: string): Promise<{ currency: string; balance_minor: number } | null> {
  const ws = (await db().query<{ workspace_id: string | null }>('SELECT workspace_id FROM services.clients WHERE id = $1', [clientId])).rows[0]?.workspace_id
  if (!ws) return null
  const w = (await asPlatform(() => db().query<{ currency: string; balance_minor: string }>('SELECT currency, balance_minor::text FROM wallet.wallets WHERE organization_id = $1', [ws]))).rows[0]
  return w ? { currency: w.currency, balance_minor: Number(w.balance_minor) } : null
}
