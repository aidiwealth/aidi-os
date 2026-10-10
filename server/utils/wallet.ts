import { createHmac, timingSafeEqual } from 'node:crypto'
// Company wallets. Every change is one atomic statement that moves the balance and writes the ledger line together;
// a debit never takes the balance below zero. Amounts are in minor units (cents, kobo).
export interface Wallet { organization_id: string; currency: string; balance_minor: number }
export async function walletOf(orgId: string): Promise<Wallet> {
  return asPlatform(async () => {
    await db().query("INSERT INTO wallet.wallets (organization_id, currency) SELECT $1, CASE WHEN settings->>'currency' = 'NGN' THEN 'NGN' ELSE 'USD' END FROM core.organizations WHERE id = $1 ON CONFLICT (organization_id) DO NOTHING", [orgId])
    return (await db().query<Wallet>('SELECT organization_id, currency, balance_minor::float AS balance_minor FROM wallet.wallets WHERE organization_id = $1', [orgId])).rows[0]!
  })
}
export async function postLedger(orgId: string, kind: 'credit' | 'debit', amountMinor: number, category: string, reason: string, opts: { reference?: string; userId?: string | null } = {}): Promise<{ id: string; balance: number } | null> {
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) throw apiError('invalid', 'Enter an amount.')
  await walletOf(orgId)
  const r = await asPlatform(() => db().query<{ id: string; balance: string }>(
    `WITH u AS (UPDATE wallet.wallets SET balance_minor = balance_minor ${kind === 'credit' ? '+' : '-'} $2, updated_at = now() WHERE organization_id = $1 ${kind === 'debit' ? 'AND balance_minor >= $2' : ''} RETURNING balance_minor, currency)
     INSERT INTO wallet.ledger (organization_id, kind, amount_minor, balance_after_minor, currency, category, reason, reference, created_by)
     SELECT $1, $3, $2, u.balance_minor, u.currency, $4, $5, $6, $7 FROM u RETURNING id, balance_after_minor::text AS balance`,
    [orgId, amountMinor, kind, category, reason.slice(0, 300), opts.reference ?? null, opts.userId ?? null]))
  if (!r.rows[0]) { if (kind === 'debit') throw apiError('insufficient', 'Not enough in the wallet. Top up first.', 402); return null }
  return { id: r.rows[0].id, balance: Number(r.rows[0].balance) }
}
// A card top-up was paid (webhook or return check). Idempotent: the reference is unique on the ledger.
export async function walletTopupSucceeded(reference: string, card: CardDetails = {}): Promise<void> {
  const t = (await asPlatform(() => db().query<{ organization_id: string; amount_minor: string; provider: string }>("UPDATE wallet.topups SET status = 'succeeded', completed_at = now() WHERE reference = $1 AND status <> 'succeeded' RETURNING organization_id, amount_minor::text, provider", [reference]))).rows[0]
  if (!t) return
  if (card.method_ref && card.reusable !== false && (t.provider === 'stripe' || t.provider === 'paystack')) await saveCard(t.organization_id, t.provider, card)
  try { await postLedger(t.organization_id, 'credit', Number(t.amount_minor), 'topup', 'Top-up by ' + (t.provider === 'paystack' ? 'Paystack' : 'card'), { reference: 'topup:' + reference }) }
  catch (err) { console.error('[wallet] topup credit failed', reference, err) }
}
export const MIN_TOPUP: Record<string, number> = { USD: 1000, NGN: 500000 }

export interface WalletSettings { monnify_enabled: boolean; monnify_env: string; monnify_api_key?: string; monnify_secret_key?: string; monnify_contract_code?: string
  bank_ngn?: { bank: string; account_number: string; account_name: string }; bank_usd?: { bank: string; account_number: string; account_name: string; routing?: string; swift?: string } }
export async function walletSettings(): Promise<WalletSettings> {
  const r = await asPlatform(() => db().query<{ value: WalletSettings }>("SELECT value FROM platform.settings WHERE key = 'wallet'"))
  return Object.assign({ monnify_enabled: false, monnify_env: 'sandbox' }, r.rows[0]?.value ?? {}) as WalletSettings
}
export const monnifyOn = (s: WalletSettings) => !!(s.monnify_enabled && s.monnify_api_key && s.monnify_secret_key && s.monnify_contract_code)

async function saveCard(orgId: string, provider: string, c: CardDetails): Promise<void> {
  await asPlatform(async () => {
    await db().query('UPDATE platform.payment_methods SET is_default = false WHERE organization_id = $1', [orgId])
    await db().query(`INSERT INTO platform.payment_methods (organization_id, provider, customer_ref, method_ref, email, brand, last4, exp_month, exp_year, is_default) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true)
      ON CONFLICT (provider, method_ref) DO UPDATE SET is_default = true, customer_ref = coalesce(EXCLUDED.customer_ref, platform.payment_methods.customer_ref)`,
      [orgId, provider, c.customer_ref ?? null, c.method_ref, c.email ?? null, c.brand ?? null, c.last4 ?? null, c.exp_month ?? null, c.exp_year ?? null])
  })
}
export async function cardOnFile(orgId: string, currency: string): Promise<{ provider: Provider; customer_ref: string | null; method_ref: string; email: string | null; brand: string | null; last4: string | null } | null> {
  const want: Provider = currency === 'NGN' ? 'paystack' : 'stripe'
  const r = await asPlatform(() => db().query<{ provider: Provider; customer_ref: string | null; method_ref: string; email: string | null; brand: string | null; last4: string | null }>(
    'SELECT provider, customer_ref, method_ref, email, brand, last4 FROM platform.payment_methods WHERE organization_id = $1 ORDER BY (provider = $2) DESC, is_default DESC, created_at DESC', [orgId, want]))
  return r.rows.find((m) => providersFor(currency).includes(m.provider)) ?? null
}
// Top-up checkout that also saves the card for automatic charges.
export async function walletCheckout(provider: Provider, o: { minor: number; currency: string; email: string; name: string; reference: string; returnUrl: string }): Promise<string> {
  if (provider === 'stripe') {
    const s = await stripeApi<{ url: string }>('checkout/sessions', { mode: 'payment', success_url: o.returnUrl + '?paid=1', cancel_url: o.returnUrl, customer_email: o.email, customer_creation: 'always', client_reference_id: o.reference,
      'line_items[0][quantity]': '1', 'line_items[0][price_data][currency]': o.currency.toLowerCase(), 'line_items[0][price_data][unit_amount]': String(o.minor), 'line_items[0][price_data][product_data][name]': o.name,
      'payment_intent_data[setup_future_usage]': 'off_session', 'payment_intent_data[metadata][reference]': o.reference, 'metadata[reference]': o.reference }, o.reference)
    return s.url
  }
  const d = await paystackApi<{ authorization_url: string }>('transaction/initialize', { email: o.email, amount: o.minor, currency: o.currency, reference: o.reference, callback_url: o.returnUrl })
  return d.authorization_url
}
// Charge the card on file and put the money in the wallet (so the ledger shows the charge, then what it paid for).
export async function chargeCardIntoWallet(orgId: string, minor: number, currency: string, label: string): Promise<{ ok: boolean; reason?: string }> {
  const m = await cardOnFile(orgId, currency)
  if (!m) return { ok: false, reason: 'No card on file' }
  const reference = 'wt_auto' + randomToken().replace(/[^A-Za-z0-9]/g, '').slice(0, 16)
  await asPlatform(() => db().query("INSERT INTO wallet.topups (organization_id, amount_minor, currency, provider, reference) VALUES ($1,$2,$3,$4,$5)", [orgId, minor, currency, m.provider, reference]))
  try {
    let ok = false, reason = ''
    if (m.provider === 'stripe') {
      const pi = await stripeApi<{ status: string }>('payment_intents', { amount: String(minor), currency: currency.toLowerCase(), customer: m.customer_ref ?? '', payment_method: m.method_ref, off_session: 'true', confirm: 'true', description: label, 'metadata[reference]': reference }, reference)
      ok = pi.status === 'succeeded'; reason = ok ? '' : 'Card needs confirmation (' + pi.status + ')'
    } else {
      const d = await paystackApi<{ status: string; gateway_response?: string }>('transaction/charge_authorization', { authorization_code: m.method_ref, email: m.email, amount: minor, currency, reference })
      ok = d.status === 'success'; reason = ok ? '' : (d.gateway_response ?? 'Card declined')
    }
    if (!ok) { await asPlatform(() => db().query("UPDATE wallet.topups SET status = 'failed', completed_at = now() WHERE reference = $1", [reference])); return { ok: false, reason } }
    await asPlatform(() => db().query("UPDATE wallet.topups SET status = 'succeeded', completed_at = now() WHERE reference = $1", [reference]))
    await postLedger(orgId, 'credit', minor, 'topup', 'Automatic charge to ' + (m.brand ?? 'card') + (m.last4 ? ' ending ' + m.last4 : ''), { reference: 'topup:' + reference })
    return { ok: true }
  } catch (err) {
    await asPlatform(() => db().query("UPDATE wallet.topups SET status = 'failed', completed_at = now() WHERE reference = $1", [reference]))
    return { ok: false, reason: (err as Error).message }
  }
}

// Recurring services created when an invoice with monthly or yearly items is paid (the first period is on the invoice).
export async function subscriptionsFromInvoice(invoiceId: string): Promise<void> {
  await asPlatform(async () => {
    const inv = (await db().query<{ client_id: string; currency: string; lines: { code?: string; interval?: string; description: string; quantity: number; unit_amount: number }[]; workspace_id: string | null }>(
      'SELECT i.client_id, i.currency, i.lines, c.workspace_id FROM services.invoices i JOIN services.clients c ON c.id = i.client_id WHERE i.id = $1', [invoiceId])).rows[0]
    if (!inv?.workspace_id) return
    for (const l of inv.lines ?? []) {
      if (!l.code) continue
      const cat = (await db().query<{ name: string; billing: string; price: string | null }>('SELECT name, billing, price::text FROM services.catalog WHERE code = $1', [l.code])).rows[0]
      if (!cat || !['monthly', 'annual'].includes(cat.billing) || !cat.price) continue
      const yearly = l.interval === 'year' || (l.interval !== 'month' && cat.billing === 'annual')
      const months = l.interval === 'month' ? 1 : yearly ? 12 : Math.max(1, l.quantity)
      const amount = cat.billing === 'monthly' && yearly ? Number(cat.price) * 12 : Number(cat.price)
      await db().query(`INSERT INTO wallet.subscriptions (organization_id, kind, code, name, client_id, amount_minor, currency, interval, next_charge_at)
        SELECT $1, 'service', $2, $3, $4, $5, $6, $7, (current_date + make_interval(months => $8))::date WHERE NOT EXISTS (SELECT 1 FROM wallet.subscriptions WHERE organization_id = $1 AND code = $2 AND status = 'active')`,
        [inv.workspace_id, l.code, cat.name, inv.client_id, Math.round(amount * 100), inv.currency, yearly ? 'year' : 'month', months])
    }
  })
}

// A plan change: keep the plan's recurring charge in step (amount in the company's currency; first charge at trial end).
export async function syncPlanSubscription(orgId: string): Promise<void> {
  await asPlatform(async () => {
    const o = (await db().query<{ plan_code: string; status: string; trial_ends_at: string | null; currency: string }>("SELECT plan_code, status, to_char(trial_ends_at, 'YYYY-MM-DD') AS trial_ends_at, CASE WHEN settings->>'currency' = 'NGN' THEN 'NGN' ELSE 'USD' END AS currency FROM core.organizations WHERE id = $1", [orgId])).rows[0]
    if (!o) return
    o.currency = (await walletOf(orgId)).currency
    const p = (await db().query<{ name: string; usd: string | null; ngn: string | null }>('SELECT name, price_monthly_usd::text AS usd, price_monthly_ngn::text AS ngn FROM core.plans WHERE code = $1', [o.plan_code])).rows[0]
    const price = p ? Number(o.currency === 'NGN' ? p.ngn : p.usd) : 0
    if (!o.plan_code.startsWith('company_') || !price) { await db().query("UPDATE wallet.subscriptions SET status = 'cancelled', updated_at = now() WHERE organization_id = $1 AND kind = 'plan' AND status <> 'cancelled'", [orgId]); return }
    const r = await db().query("UPDATE wallet.subscriptions SET code = $2, name = $3, amount_minor = $4, currency = $5, status = 'active', failures = 0, updated_at = now() WHERE organization_id = $1 AND kind = 'plan' AND status <> 'cancelled'", [orgId, o.plan_code, p!.name + ' plan', Math.round(price * 100), o.currency])
    if (!r.rowCount) await db().query("INSERT INTO wallet.subscriptions (organization_id, kind, code, name, amount_minor, currency, interval, next_charge_at) VALUES ($1,'plan',$2,$3,$4,$5,'month', coalesce($6::date, current_date))", [orgId, o.plan_code, p!.name + ' plan', Math.round(price * 100), o.currency, o.trial_ends_at])
  })
}

// Monnify: one reserved account per company; transfers to it credit the wallet (webhook).
const monnifyBase = (env: string) => (env === 'live' ? 'https://api.monnify.com' : 'https://sandbox.monnify.com')
export async function monnifyReserve(s: WalletSettings, o: { reference: string; name: string; email: string; bvn?: string; nin?: string }) {
  const basic = Buffer.from(s.monnify_api_key + ':' + s.monnify_secret_key).toString('base64')
  const a = await fetch(monnifyBase(s.monnify_env) + '/api/v1/auth/login', { method: 'POST', headers: { Authorization: 'Basic ' + basic }, signal: AbortSignal.timeout(15000) })
  const tok = ((await a.json().catch(() => ({}))) as { responseBody?: { accessToken?: string } }).responseBody?.accessToken
  if (!a.ok || !tok) throw apiError('monnify', 'Could not reach the bank partner. Try again shortly.', 502)
  const body: Record<string, unknown> = { accountReference: o.reference, accountName: o.name.slice(0, 60), currencyCode: 'NGN', contractCode: s.monnify_contract_code, customerEmail: o.email, customerName: o.name.slice(0, 60), getAllAvailableBanks: true }
  if (o.bvn) body.bvn = o.bvn; if (o.nin) body.nin = o.nin
  const r = await fetch(monnifyBase(s.monnify_env) + '/api/v2/bank-transfer/reserved-accounts', { method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) })
  const j = (await r.json().catch(() => ({}))) as { responseMessage?: string; responseBody?: { accounts?: { bankName: string; accountNumber: string; accountName: string }[] } }
  if (!r.ok || !j.responseBody?.accounts?.length) throw apiError('monnify', j.responseMessage ?? 'Could not create the account. Check the BVN or NIN.', 400)
  return j.responseBody.accounts
}
export function monnifySignatureOk(secret: string, raw: string, sig: string): boolean {
  const want = createHmac('sha512', secret).update(raw, 'utf8').digest('hex')
  return sig.length === want.length && timingSafeEqual(Buffer.from(sig), Buffer.from(want))
}
