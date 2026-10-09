// Wealth fees: subscriptions are paid online (Stripe in the US, Paystack in Nigeria); advisory fees by bank transfer to
// the account set in Wealth settings. Each fee gets a numbered invoice PDF, and a receipt PDF once paid.
import { createHmac, timingSafeEqual } from 'node:crypto'
export const wmPayToken = (feeId: string) => feeId + '.' + createHmac('sha256', useRuntimeConfig().jwtSecret as string).update('wmpay:' + feeId).digest('base64url').slice(0, 32)
export function wmFeeFromToken(t: string): string | null { const [id, sig] = t.split('.'); if (!id || !sig || !/^[0-9a-f-]{36}$/.test(id)) return null; const want = wmPayToken(id).split('.')[1]!; return sig.length === want.length && timingSafeEqual(Buffer.from(sig), Buffer.from(want)) ? id : null }
interface FeeRow { id: string; number: string | null; kind: string; period: string | null; amount: string; subtotal: string | null; tax_amount: string | null; tax_label: string | null; tax_rate: string | null; currency: string; status: string; paid_on: string | null; due_date: string | null; created_at: string; client: string | null; email: string | null; contact_name: string | null; country: string | null; entity: string | null; entity_address: string | null; firm: string | null; method: string | null }
async function feeRow(id: string): Promise<FeeRow | undefined> {
  return (await db().query<FeeRow>(`SELECT f.id, f.number, f.kind, f.period, f.amount::text, f.subtotal::text, f.tax_amount::text, f.tax_label, f.tax_rate::text, f.currency, f.status, to_char(f.paid_on, 'YYYY-MM-DD') AS paid_on, to_char(f.due_date, 'YYYY-MM-DD') AS due_date, to_char(f.created_at, 'YYYY-MM-DD') AS created_at,
      c.name AS client, c.email, c.contact_name, coalesce(c.country, fm.country) AS country, e.name AS entity, e.address AS entity_address, fm.name AS firm, f.method
    FROM wm.fees f LEFT JOIN wm.clients c ON c.id = f.client_id LEFT JOIN wm.firms fm ON fm.id = f.firm_id LEFT JOIN core.entities e ON e.id = coalesce(f.entity_id, c.entity_id) WHERE f.id = $1`, [id])).rows[0]
}
const KIND: Record<string, string> = { subscription: 'Aidi Wealth subscription', advisory: 'Advisory fee', referral: 'Referral fee' }
async function bankText(country: string | null) { const b = ((await wmSettings()) as unknown as { banks?: Record<string, Record<string, string>> }).banks?.[country === 'NG' ? 'NG' : 'US'] ?? {}; return Object.entries({ Bank: b.bank, 'Account name': b.account_name, 'Account number': b.account_number, 'Routing (ACH)': b.routing, 'Wire / SWIFT': b.swift, 'Bank address': b.address }).filter(([, v]) => v).map(([k, v]) => k + ': ' + v).join('\n') }
async function pdfFor(f: FeeRow, receipt: boolean) {
  const payLine = f.kind === 'advisory' || f.method === 'transfer' ? await bankText(f.country) : 'Pay online: ' + brands().aidi.url + '/wpay/' + wmPayToken(f.id)
  return invoicePdf({ title: receipt ? 'RECEIPT' : 'INVOICE', number: f.number ?? f.id.slice(0, 8), issue_date: receipt ? (f.paid_on ?? f.created_at) : f.created_at, due_date: receipt ? null : f.due_date, status: receipt ? 'paid' : f.status, paid_at: f.paid_on, currency: f.currency,
    issuer: { name: f.entity ?? 'Aidi Wealth', address: f.entity_address ?? undefined }, bill_to: { name: f.client ?? f.firm ?? '', email: f.email ?? undefined },
    lines: [{ description: (KIND[f.kind] ?? f.kind) + (f.period ? ' · ' + f.period : ''), quantity: 1, unit_amount: Number(f.subtotal ?? f.amount), amount: Number(f.subtotal ?? f.amount) }, ...(Number(f.tax_amount) > 0 ? [{ description: (f.tax_label ?? 'VAT') + ' (' + Number(f.tax_rate) + '%)', quantity: 1, unit_amount: Number(f.tax_amount), amount: Number(f.tax_amount), kind: 'tax' }] : [])], amount: Number(f.amount),
    note: receipt ? 'Thank you. Payment received' + (f.method ? ' by ' + (f.method === 'transfer' ? 'bank transfer' : f.method) : '') + '.' : f.kind === 'advisory' ? 'Please pay by bank transfer, quoting invoice ' + (f.number ?? '') + '.' : null, payment: receipt ? null : payLine })
}
// VAT on a new fee (same rule as every other invoice): the logged amount is the net fee; the fee's amount becomes the
// total to pay. Runs once per fee.
export async function taxFee(feeId: string) {
  const f = (await db().query<{ amount: string; currency: string; country: string | null; subtotal: string | null }>(
    'SELECT f.amount::text, f.currency, coalesce(c.country, fm.country) AS country, f.subtotal::text FROM wm.fees f LEFT JOIN wm.clients c ON c.id = f.client_id LEFT JOIN wm.firms fm ON fm.id = f.firm_id WHERE f.id = $1', [feeId])).rows[0]
  if (!f || f.subtotal !== null) return
  const t = await taxOnAmount(Number(f.amount), taxCountry({ currency: f.currency, country: f.country }), 'wealth')
  await db().query('UPDATE wm.fees SET country = $2, subtotal = $3, tax_label = $4, tax_rate = $5, tax_amount = $6, amount = $7 WHERE id = $1', [feeId, t.country, t.subtotal, t.tax_label, t.tax_rate, t.tax_amount, t.amount])
}
// Number the fee, create its invoice PDF, and email it with the way to pay.
export async function issueFee(feeId: string, email = true) {
  await taxFee(feeId)
  let f = await feeRow(feeId); if (!f) throw apiError('not_found', 'Fee not found.', 404)
  if (!f.number) { const n = Number((await db().query<{ n: string }>("SELECT count(*) AS n FROM wm.fees WHERE number IS NOT NULL AND created_at >= date_trunc('year', now())")).rows[0]?.n ?? 0) + 1; await db().query("UPDATE wm.fees SET number = $2, due_date = coalesce(due_date, current_date + 14), method = coalesce(method, CASE WHEN kind = 'advisory' THEN 'transfer' ELSE 'online' END) WHERE id = $1", [feeId, 'AW-' + new Date().getFullYear() + '-' + String(n).padStart(4, '0')]); f = (await feeRow(feeId))! }
  const doc = await storePdf(await pdfFor(f, false), 'Invoice ' + f.number + ' - ' + (f.client ?? f.firm ?? '') + '.pdf', null)
  await db().query('UPDATE wm.fees SET invoice_doc_id = $2, sent_at = now() WHERE id = $1', [feeId, doc])
  if (email && f.email) {
    const amt = new Intl.NumberFormat('en-US', { style: 'currency', currency: f.currency }).format(Number(f.amount))
    const how = f.method === 'transfer' ? 'Please pay by bank transfer:\n' + await bankText(f.country) : 'Pay securely online: ' + brands().aidi.url + '/wpay/' + wmPayToken(f.id)
    try { await sendEmail({ to: f.email, subject: 'Invoice ' + f.number + ' from ' + (f.entity ?? 'Aidi Wealth'), text: 'Hello ' + (f.contact_name ?? f.client ?? '') + ',\n\nYour invoice ' + f.number + ' for ' + amt + ' (' + (KIND[f.kind] ?? f.kind) + (f.period ? ', ' + f.period : '') + ') is ready.\n\n' + how + '\n\nThank you,\n' + (f.entity ?? 'Aidi Wealth'),
      html: '<p>Hello ' + (f.contact_name ?? f.client ?? '').replace(/</g, '&lt;') + ',</p><p>Your invoice <b>' + f.number + '</b> for <b>' + amt + '</b> (' + (KIND[f.kind] ?? f.kind) + (f.period ? ', ' + f.period : '') + ') is ready.</p>' + (f.method === 'transfer' ? '<p style="white-space:pre-wrap">Please pay by bank transfer:<br>' + (await bankText(f.country)).replace(/</g, '&lt;').replace(/\n/g, '<br>') + '</p>' : '<p><a href="' + brands().aidi.url + '/wpay/' + wmPayToken(f.id) + '" style="color:#1c4f9c">Pay securely online</a></p>') + '<p>Thank you,<br>' + (f.entity ?? 'Aidi Wealth') + '</p>' }) } catch (err) { console.error('[wm] invoice email', err) }
  }
  return { number: f.number, invoice_doc_id: doc }
}
// Mark paid: books it, creates the receipt, emails it.
export async function markFeePaid(feeId: string, method: string, paidOn?: string | null) {
  await db().query("UPDATE wm.fees SET status = 'paid', paid_on = coalesce($3::date, current_date), method = $2 WHERE id = $1", [feeId, method, paidOn || null])
  await bookFee(feeId)
  const f = (await feeRow(feeId))!
  if (!f.number) await issueFee(feeId, false)
  const g = (await feeRow(feeId))!
  const doc = await storePdf(await pdfFor(g, true), 'Receipt ' + g.number + ' - ' + (g.client ?? g.firm ?? '') + '.pdf', null)
  await db().query('UPDATE wm.fees SET receipt_doc_id = $2 WHERE id = $1', [feeId, doc])
  if (g.email) { try { await sendEmail({ to: g.email, subject: 'Receipt ' + g.number + ' — thank you', text: 'We received your payment of ' + new Intl.NumberFormat('en-US', { style: 'currency', currency: g.currency }).format(Number(g.amount)) + ' for ' + (KIND[g.kind] ?? g.kind) + (g.period ? ' (' + g.period + ')' : '') + '. Your receipt is in your Aidi Wealth portal.', html: '<p>We received your payment of <b>' + new Intl.NumberFormat('en-US', { style: 'currency', currency: g.currency }).format(Number(g.amount)) + '</b> for ' + (KIND[g.kind] ?? g.kind) + (g.period ? ' (' + g.period + ')' : '') + '.</p><p>Your receipt is in your Aidi Wealth portal.</p>' }) } catch { /* ignore */ } }
  return { receipt_doc_id: doc }
}
// Online payment confirmed by Stripe or Paystack (reference wm_<fee>_<time>).
export async function wmPaymentSucceeded(reference: string) {
  const f = (await asPlatform(() => db().query<{ id: string; organization_id: string; status: string; currency: string }>("SELECT id, organization_id, status, currency FROM wm.fees WHERE pay_ref = $1", [reference]))).rows[0]
  if (!f || f.status === 'paid') return
  setOrgContext(f.organization_id)
  await markFeePaid(f.id, f.currency === 'NGN' ? 'paystack' : 'stripe')
}
