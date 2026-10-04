// Online payments. Stripe takes cards in USD; Paystack takes cards and bank payments in NGN (and USD if the Paystack
// account allows it). Card details never touch Finvry: customers pay on the provider's page, and only the provider's
// reference to a saved card (and its brand, last four digits and expiry) is kept, to charge renewals.
import { createHmac, timingSafeEqual } from 'node:crypto'

export type Provider = 'stripe' | 'paystack'
const cfg = () => useRuntimeConfig()
export const stripeOn = (): boolean => !!cfg().stripeSecretKey
export const paystackOn = (): boolean => !!cfg().paystackSecretKey
export function providersFor(currency: string): Provider[] {
  const out: Provider[] = []
  if (stripeOn() && currency === 'USD') out.push('stripe')
  if (paystackOn() && (currency === 'NGN' || currency === 'USD')) out.push('paystack')
  return out
}
const minor = (amount: number | string): number => Math.round(Number(amount) * 100)

async function stripe<T = Record<string, unknown>>(path: string, params?: Record<string, string>, idem?: string): Promise<T> {
  const headers: Record<string, string> = { Authorization: 'Bearer ' + cfg().stripeSecretKey }
  if (params) headers['Content-Type'] = 'application/x-www-form-urlencoded'
  if (idem) headers['Idempotency-Key'] = idem
  const res = await fetch('https://api.stripe.com/v1/' + path, { method: params ? 'POST' : 'GET', headers, body: params ? new URLSearchParams(params) : undefined })
  let j: T & { error?: { message?: string } }
  try { j = JSON.parse(await res.text()) } catch { throw new Error('Stripe: HTTP ' + res.status) }
  if (!res.ok) throw new Error('Stripe: ' + (j.error?.message ?? res.status))
  return j
}
async function paystack<T = Record<string, unknown>>(path: string, body?: unknown): Promise<T> {
  const res = await fetch('https://api.paystack.co/' + path, {
    method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + cfg().paystackSecretKey, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
  let j: { status: boolean; message: string; data: T }
  try { j = JSON.parse(await res.text()) } catch { throw new Error('Paystack: HTTP ' + res.status) }
  if (!res.ok || !j.status) throw new Error('Paystack: ' + (j.message ?? res.status))
  return j.data
}

// The pay link: /pay/<invoice id>.<signature>. Nothing to store; it stops working once the invoice is paid or void.
export function payToken(invoiceId: string): string {
  return invoiceId + '.' + createHmac('sha256', cfg().jwtSecret).update('pay:' + invoiceId).digest('base64url').slice(0, 32)
}
export function invoiceIdFromToken(token: string): string | null {
  const [id, sig] = token.split('.')
  if (!id || !sig || !/^[0-9a-f-]{36}$/.test(id)) return null
  const want = payToken(id).split('.')[1]!
  return sig.length === want.length && timingSafeEqual(Buffer.from(sig), Buffer.from(want)) ? id : null
}
export async function payUrl(invoiceId: string, orgId: string): Promise<string> {
  const prev = currentOrgId()
  setOrgContext(orgId)
  try { return (await appUrl()) + '/pay/' + payToken(invoiceId) } finally { setOrgContext(prev) }
}

// Start a payment on the provider's page. Returns the address to send the customer to.
export async function startCheckout(inv: Invoice, provider: Provider, returnUrl: string): Promise<string> {
  if (!providersFor(inv.currency).includes(provider)) throw apiError('unavailable', 'That payment method is not available for this invoice.')
  const reference = 'fv_' + inv.number.replace(/[^A-Za-z0-9]/g, '') + '_' + Date.now().toString(36)
  await asPlatform(() => db().query("INSERT INTO platform.payments (invoice_id, organization_id, provider, kind, reference, amount, currency) VALUES ($1,$2,$3,'checkout',$4,$5,$6)",
    [inv.id, inv.organization_id, provider, reference, inv.amount, inv.currency]))
  try {
  if (provider === 'stripe') {
    const s = await stripe<{ url: string }>('checkout/sessions', {
      mode: 'payment', success_url: returnUrl + '?paid=1', cancel_url: returnUrl, customer_email: inv.bill_to.email, client_reference_id: reference, customer_creation: 'always',
      'line_items[0][quantity]': '1', 'line_items[0][price_data][currency]': inv.currency.toLowerCase(), 'line_items[0][price_data][unit_amount]': String(minor(inv.amount)),
      'line_items[0][price_data][product_data][name]': 'Invoice ' + inv.number + ' · ' + inv.customer,
      'payment_intent_data[setup_future_usage]': 'off_session', 'payment_intent_data[metadata][reference]': reference, 'metadata[reference]': reference
    }, reference)
    return s.url
  }
  const d = await paystack<{ authorization_url: string }>('transaction/initialize', {
    email: inv.bill_to.email, amount: minor(inv.amount), currency: inv.currency, reference, callback_url: returnUrl + '?ref=' + reference, metadata: { invoice: inv.number, customer: inv.customer } })
  return d.authorization_url
  } catch (err) {
    console.error('[payments] checkout failed', err)
    await recordFailure(reference, (err as Error).message)
    throw apiError('provider', 'Could not open the payment page. Please try again in a moment.', 502)
  }
}

export interface CardDetails { customer_ref?: string | null; method_ref?: string | null; email?: string | null; brand?: string | null; last4?: string | null; exp_month?: number | null; exp_year?: number | null; reusable?: boolean }

// A payment went through: mark it and its invoice paid, save the card for renewals, lift past-due, send a receipt. Idempotent.
export async function recordSuccess(reference: string, card: CardDetails = {}): Promise<void> {
  const done = await asPlatform(async () => {
    const p = await db().query<{ invoice_id: string; organization_id: string; provider: Provider }>(
      "UPDATE platform.payments SET status = 'succeeded', completed_at = now() WHERE reference = $1 AND status <> 'succeeded' RETURNING invoice_id, organization_id, provider", [reference])
    const row = p.rows[0]
    if (!row) return null
    await db().query("UPDATE platform.invoices SET status = 'paid', paid_at = current_date, paid_via = $2 WHERE id = $1 AND status IN ('draft','sent')", [row.invoice_id, row.provider])
    const sub = await db().query<{ id: string }>("UPDATE platform.subscriptions s SET status = 'active' FROM platform.invoices i WHERE i.id = $1 AND s.id = i.subscription_id AND s.status = 'past_due' RETURNING s.id", [row.invoice_id])
    if (sub.rowCount) await db().query("UPDATE core.organizations SET status = 'active' WHERE id = $1 AND status = 'past_due'", [row.organization_id])
    if (card.method_ref && card.reusable !== false) {
      await db().query('UPDATE platform.payment_methods SET is_default = false WHERE organization_id = $1', [row.organization_id])
      await db().query(`INSERT INTO platform.payment_methods (organization_id, provider, customer_ref, method_ref, email, brand, last4, exp_month, exp_year, is_default)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true) ON CONFLICT (provider, method_ref) DO UPDATE SET is_default = true, customer_ref = coalesce(EXCLUDED.customer_ref, platform.payment_methods.customer_ref)`,
        [row.organization_id, row.provider, card.customer_ref ?? null, card.method_ref, card.email ?? null, card.brand ?? null, card.last4 ?? null, card.exp_month ?? null, card.exp_year ?? null])
    }
    await db().query("INSERT INTO core.audit_log (organization_id, action, object_type, object_id, detail) VALUES ($1, 'platform.payment_received', 'invoice', $2, $3)",
      [row.organization_id, row.invoice_id, JSON.stringify({ provider: row.provider, reference })])
    return row
  })
  if (!done) return
  const inv = await loadInvoice(done.invoice_id)
  if (!inv) return
  setOrgContext(inv.organization_id)
  try { await sendPaymentReceiptEmail(inv, (await billingSettings()).issuer_name) } catch (err) { console.error('[payments] receipt failed for ' + inv.number, err) }
  setOrgContext(null)
}
export async function recordFailure(reference: string, reason: string): Promise<void> {
  await asPlatform(() => db().query("UPDATE platform.payments SET status = 'failed', failure = left($2, 500), completed_at = now() WHERE reference = $1 AND status = 'pending'", [reference, reason]))
}

// Charge the customer's saved card for an invoice (renewals). Returns true if it was paid.
export async function chargeSaved(inv: Invoice, preferred?: Provider): Promise<{ ok: boolean; reason?: string; noCard?: boolean }> {
  const m = (await asPlatform(() => db().query<{ provider: Provider; customer_ref: string | null; method_ref: string; email: string | null }>(
    'SELECT provider, customer_ref, method_ref, email FROM platform.payment_methods WHERE organization_id = $1 ORDER BY (provider = $2) DESC, is_default DESC, created_at DESC',
    [inv.organization_id, preferred ?? '']))).rows.find((x) => providersFor(inv.currency).includes(x.provider))
  if (!m) return { ok: false, reason: 'No saved card for ' + inv.currency + ' payments.', noCard: true }
  const reference = 'fv_' + inv.number.replace(/[^A-Za-z0-9]/g, '') + '_auto_' + Date.now().toString(36)
  await asPlatform(() => db().query("INSERT INTO platform.payments (invoice_id, organization_id, provider, kind, reference, amount, currency) VALUES ($1,$2,$3,'auto',$4,$5,$6)",
    [inv.id, inv.organization_id, m.provider, reference, inv.amount, inv.currency]))
  try {
    if (m.provider === 'stripe') {
      const pi = await stripe<{ status: string }>('payment_intents', { amount: String(minor(inv.amount)), currency: inv.currency.toLowerCase(), customer: m.customer_ref ?? '', payment_method: m.method_ref,
        off_session: 'true', confirm: 'true', description: 'Invoice ' + inv.number, 'metadata[reference]': reference }, reference)
      if (pi.status === 'succeeded') { await recordSuccess(reference); return { ok: true } }
      if (pi.status === 'processing') return { ok: false, reason: 'Payment processing' }
      await recordFailure(reference, 'Stripe status ' + pi.status); return { ok: false, reason: 'The card needs the customer to confirm the payment.' }
    }
    const d = await paystack<{ status: string; gateway_response?: string }>('transaction/charge_authorization', {
      authorization_code: m.method_ref, email: m.email ?? inv.bill_to.email, amount: minor(inv.amount), currency: inv.currency, reference })
    if (d.status === 'success') { await recordSuccess(reference); return { ok: true } }
    await recordFailure(reference, d.gateway_response ?? d.status); return { ok: false, reason: d.gateway_response ?? 'Card declined' }
  } catch (err) {
    await recordFailure(reference, (err as Error).message); return { ok: false, reason: (err as Error).message }
  }
}

// Card details behind a completed Stripe payment.
export async function stripeCard(paymentIntentId: string): Promise<CardDetails> {
  const pi = await stripe<{ customer: string | null; payment_method: { id: string; billing_details?: { email?: string }; card?: { brand: string; last4: string; exp_month: number; exp_year: number } } | null }>(
    'payment_intents/' + encodeURIComponent(paymentIntentId) + '?expand[]=payment_method')
  const pm = pi.payment_method
  return { customer_ref: pi.customer, method_ref: pm?.id, email: pm?.billing_details?.email ?? null, brand: pm?.card?.brand, last4: pm?.card?.last4, exp_month: pm?.card?.exp_month, exp_year: pm?.card?.exp_year }
}
export function paystackCard(data: { customer?: { email?: string; customer_code?: string }; authorization?: { authorization_code?: string; reusable?: boolean; card_type?: string; last4?: string; exp_month?: string; exp_year?: string } }): CardDetails {
  const a = data.authorization
  return { customer_ref: data.customer?.customer_code ?? null, method_ref: a?.authorization_code, email: data.customer?.email ?? null, brand: a?.card_type?.trim() || null,
    last4: a?.last4 && /^\d{4}$/.test(a.last4) ? a.last4 : null, exp_month: a?.exp_month ? Number(a.exp_month) : null, exp_year: a?.exp_year ? Number(a.exp_year) : null, reusable: !!a?.reusable }
}
export async function paystackVerify(reference: string): Promise<void> {
  const d = await paystack<{ status: string } & Parameters<typeof paystackCard>[0]>('transaction/verify/' + encodeURIComponent(reference))
  if (d.status === 'success') await recordSuccess(reference, paystackCard(d))
}

// Webhook signatures.
export function stripeSignatureOk(raw: string, header: string): boolean {
  const secret = cfg().stripeWebhookSecret
  if (!secret || !header) return false
  const parts = Object.fromEntries(header.split(',').map((kv) => kv.split('=') as [string, string]))
  const t = Number(parts.t)
  if (!t || Math.abs(Date.now() / 1000 - t) > 600) return false
  const want = createHmac('sha256', secret).update(t + '.' + raw).digest('hex')
  return header.split(',').some((kv) => { const [k, v] = kv.split('='); return k === 'v1' && v?.length === want.length && timingSafeEqual(Buffer.from(v), Buffer.from(want)) })
}
export function paystackSignatureOk(raw: string, header: string): boolean {
  const key = cfg().paystackSecretKey
  if (!key || !header) return false
  const want = createHmac('sha512', key).update(raw).digest('hex')
  return header.length === want.length && timingSafeEqual(Buffer.from(header), Buffer.from(want))
}

// ── Client Services invoices: Aidi's own workspace collects through the same accounts (Stripe for USD, Paystack for NGN).
export function csProviders(currency: string, brand: string | undefined): Provider[] {
  if (brand !== 'aidi') return []
  if (currency === 'USD' && stripeOn()) return ['stripe']
  if (currency === 'NGN' && paystackOn()) return ['paystack']
  return []
}
export async function providerCheckout(provider: Provider, o: { amount: number | string; currency: string; email: string; name: string; reference: string; returnUrl: string }): Promise<string> {
  if (provider === 'stripe') {
    const s = await stripe<{ url: string }>('checkout/sessions', {
      mode: 'payment', success_url: o.returnUrl + '?paid=1', cancel_url: o.returnUrl, customer_email: o.email, client_reference_id: o.reference,
      'line_items[0][quantity]': '1', 'line_items[0][price_data][currency]': o.currency.toLowerCase(), 'line_items[0][price_data][unit_amount]': String(minor(o.amount)),
      'line_items[0][price_data][product_data][name]': o.name, 'payment_intent_data[metadata][reference]': o.reference, 'metadata[reference]': o.reference
    }, o.reference)
    return s.url
  }
  const d = await paystack<{ authorization_url: string }>('transaction/initialize', { email: o.email, amount: minor(o.amount), currency: o.currency, reference: o.reference, callback_url: o.returnUrl + '?ref=' + o.reference })
  return d.authorization_url
}
export async function paystackStatus(reference: string): Promise<string> {
  return (await paystack<{ status: string }>('transaction/verify/' + encodeURIComponent(reference))).status
}

// Provider calls for the wallet (top-ups that save the card; charging a saved card).
export const stripeApi = stripe
export const paystackApi = paystack
