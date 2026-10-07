// Wealth client: investing (Alpaca, US), wallet (Fincra virtual accounts), crypto (Busha, Nigeria) and savings plans.
// Client-initiated only: Aidi does not recommend investments.
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'wealth_client')
  const id = await wmClientOfUser(user.userId)
  if (!id) throw apiError('not_found', 'Not found', 404)

  const r = await railsFor(id)
  if (getMethod(event) === 'GET') return investView(id)
  const b = await readBody<Record<string, any>>(event)
  const a = String(b?.action ?? '')
  const s = (k: string, max = 200) => (typeof b?.[k] === 'string' ? (b[k] as string).trim().slice(0, max) : '')
  if (a.startsWith('alpaca') && !r.alpaca) throw apiError('off', 'Investing through Alpaca is not switched on for this account.', 400)
  if (a.startsWith('fincra') && !r.fincra) throw apiError('off', 'The wallet is not switched on for this account.', 400)
  if (a.startsWith('busha') && !r.busha) throw apiError('off', 'Crypto through Busha is not switched on for this account.', 400)
  if (a === 'alpaca_open') {
    if (await providerRow(id, 'alpaca').then((x) => x?.external_id)) throw apiError('exists', 'An investment account is already open.', 409)
    if (!b.agree) throw apiError('invalid', 'Please accept the Alpaca customer agreement.')
    const need = ['given_name', 'family_name', 'date_of_birth', 'tax_id', 'phone', 'street', 'city', 'state', 'postal_code']
    if (need.some((k) => !s(k))) throw apiError('invalid', 'Fill in your name, date of birth, Social Security number, phone and address.')
    const now = new Date().toISOString(), ip = getRequestIP(event, { xForwardedFor: true }) ?? '0.0.0.0'
    const agreements = [{ agreement: 'customer_agreement', signed_at: now, ip_address: ip }, ...(b.crypto ? [{ agreement: 'crypto_agreement', signed_at: now, ip_address: ip }] : [])]
    const acct = await alpaca('/v1/accounts', 'POST', { contact: { email_address: r.c.email, phone_number: s('phone'), street_address: [s('street')], city: s('city'), state: s('state', 2).toUpperCase(), postal_code: s('postal_code', 10) },
      identity: { given_name: s('given_name'), family_name: s('family_name'), date_of_birth: s('date_of_birth', 10), tax_id: s('tax_id', 11).replace(/\D/g, '').replace(/^(\d{3})(\d{2})(\d{4})$/, '$1-$2-$3'), tax_id_type: 'USA_SSN', country_of_citizenship: 'USA', country_of_birth: 'USA', country_of_tax_residence: 'USA', funding_source: [s('funding_source') || 'employment_income'] },
      disclosures: { is_control_person: false, is_affiliated_exchange_or_finra: false, is_politically_exposed: false, immediate_family_exposed: false }, agreements, enabled_assets: b.crypto ? ['us_equity', 'crypto'] : ['us_equity'] })
    await saveProvider(id, 'alpaca', acct.id, acct.status ?? 'SUBMITTED', { account_number: acct.account_number ?? null, opened_at: now })
    await db().query("UPDATE wm.clients SET kyc_provider = 'alpaca', kyc_status = CASE WHEN kyc_status = 'verified' THEN kyc_status ELSE 'pending' END, updated_at = now() WHERE id = $1", [id])
    return { ok: true, status: acct.status }
  }
  const acc = a.startsWith('alpaca') ? (await providerRow(id, 'alpaca'))?.external_id : null
  if (a.startsWith('alpaca') && !acc) throw apiError('invalid', 'Open the investment account first.')
  if (a === 'alpaca_order') {
    const sym = s('symbol', 20).toUpperCase(), side = s('side') === 'sell' ? 'sell' : 'buy', crypto = sym.includes('/'), notional = Number(b.notional)
    if (!/^[A-Z.]{1,10}(\/[A-Z]{2,5})?$/.test(sym) || !(notional > 0)) throw apiError('invalid', 'Enter a symbol (e.g. VOO, AAPL or BTC/USD) and an amount.')
    const o = await alpaca(`/v1/trading/accounts/${acc}/orders`, 'POST', { symbol: sym, notional: notional.toFixed(2), side, type: 'market', time_in_force: crypto ? 'gtc' : 'day' })
    await audit({ event, actorUserId: user.userId, action: 'wm.order', objectType: 'wm_client', objectId: id, detail: { symbol: sym, side, notional } })
    return { ok: true, order: { id: o.id, status: o.status } }
  }
  if (a === 'alpaca_bank') {
    const rel = await alpaca(`/v1/accounts/${acc}/ach_relationships`, 'POST', { account_owner_name: s('account_owner_name', 120), bank_account_type: s('bank_account_type') === 'SAVINGS' ? 'SAVINGS' : 'CHECKING', bank_account_number: s('bank_account_number', 20), bank_routing_number: s('bank_routing_number', 9) })
    return { ok: true, relationship: { id: rel.id, status: rel.status } }
  }
  if (a === 'alpaca_transfer') {
    const amt = Number(b.amount); if (!(amt > 0) || !s('relationship_id')) throw apiError('invalid', 'Choose the bank and amount.')
    const t = await alpaca(`/v1/accounts/${acc}/transfers`, 'POST', { transfer_type: 'ach', relationship_id: s('relationship_id'), amount: amt.toFixed(2), direction: s('direction') === 'OUTGOING' ? 'OUTGOING' : 'INCOMING' })
    await audit({ event, actorUserId: user.userId, action: 'wm.transfer', objectType: 'wm_client', objectId: id, detail: { amount: amt, direction: s('direction') } })
    return { ok: true, transfer: { id: t.id, status: t.status } }
  }
  if (a === 'fincra_ngn') {
    if (r.c.country !== 'NG') throw apiError('invalid', 'Naira accounts are for Nigerian clients.')
    if ((await db().query("SELECT 1 FROM wm.virtual_accounts WHERE client_id = $1 AND currency = 'NGN' AND status <> 'declined'", [id])).rowCount) throw apiError('exists', 'The Naira account is already open.', 409)
    if (!r.c.bvn_enc) throw apiError('invalid', 'Complete BVN verification (KYC) first.')
    const k = r.c.kyc_detail as { name?: string }, names = (k.name || r.c.contact_name || r.c.name).split(/\s+/)
    const v = await fincra('/profile/virtual-accounts/requests', 'POST', { currency: 'NGN', accountType: 'individual', KYCInformation: { firstName: names[0], lastName: names[names.length - 1], email: r.c.email ?? undefined, bvn: decryptText(r.c.bvn_enc) }, merchantReference: 'wm-' + id.slice(0, 8) + '-ngn' })
    const d = v.data ?? {}
    await db().query("INSERT INTO wm.virtual_accounts (client_id, currency, fincra_id, status, account) VALUES ($1,'NGN',$2,$3,$4) ON CONFLICT (client_id, currency) DO UPDATE SET fincra_id = EXCLUDED.fincra_id, status = EXCLUDED.status, account = EXCLUDED.account, reason = NULL, updated_at = now()", [id, d._id ?? d.id ?? null, d.status ?? 'pending', JSON.stringify(d.accountInformation ?? {})])
    return { ok: true, status: d.status }
  }
  if (a === 'fincra_usd') {
    if ((await db().query("SELECT 1 FROM wm.virtual_accounts WHERE client_id = $1 AND currency = 'USD' AND status <> 'declined'", [id])).rowCount) throw apiError('exists', 'A USD account has already been requested.', 409)
    const need = ['first_name', 'last_name', 'birth_date', 'phone', 'nationality', 'occupation', 'employment_status', 'source_of_income', 'street', 'number', 'city', 'state', 'zip', 'country', 'doc_number', 'doc_issued', 'doc_expiry', 'income_lower', 'income_upper']
    if (need.some((x) => !s(x))) throw apiError('invalid', 'Fill in every field, including passport details and address.')
    const docs = (await db().query<{ kind: string; storage_key: string }>("SELECT p.kind, d.storage_key FROM wm.profile_docs p JOIN core.documents d ON d.id = p.document_id WHERE p.client_id = $1 AND p.kind IN ('passport','proof_of_address') ORDER BY p.created_at DESC", [id])).rows
    const passport = docs.find((x) => x.kind === 'passport'), proof = docs.find((x) => x.kind === 'proof_of_address')
    if (!passport || !proof) throw apiError('invalid', 'Upload a passport and a proof of address from the last 3 months (utility bill or bank statement) first.')
    const url = async (key: string) => signedGetUrl({ key, filename: key.split('/').pop() ?? 'document', seconds: 7 * 24 * 3600 })
    const tax = s('tax_country', 2).toUpperCase() || (r.c.country === 'US' ? 'US' : 'NG')
    const v = await fincra('/profile/virtual-accounts/requests', 'POST', { currency: 'USD', accountType: 'individual', meansOfId: [await url(passport.storage_key)], utilityBill: await url(proof.storage_key), bankStatement: await url(proof.storage_key), merchantReference: 'wm-' + id.slice(0, 8) + '-usd',
      KYCInformation: { firstName: s('first_name'), lastName: s('last_name'), email: r.c.email, phone: s('phone', 30), birthDate: s('birth_date', 10), nationality: s('nationality', 2).toUpperCase(), occupation: s('occupation'), employmentStatus: s('employment_status'), sourceOfIncome: s('source_of_income'), accountDesignation: 'Personal savings and investments', taxCountry: tax, ...(tax === 'US' ? { taxNumber: s('tax_number', 20) } : {}),
        incomeBand: { lower: s('income_lower', 20), upper: s('income_upper', 20) }, address: { street: s('street'), number: s('number', 20), city: s('city'), state: s('state'), zip: s('zip', 12), countryOfResidence: s('country', 2).toUpperCase() },
        document: { type: 'passport', number: s('doc_number', 30), issuedCountryCode: s('doc_country', 2).toUpperCase() || s('nationality', 2).toUpperCase(), issuedBy: 'government', issuedDate: s('doc_issued', 10), expirationDate: s('doc_expiry', 10) } },
      monthlyTransactionCount: s('monthly_count', 10) || '5', monthlyTransactionVolume: s('monthly_volume', 20) || '5000' })
    const d = v.data ?? {}
    await db().query("INSERT INTO wm.virtual_accounts (client_id, currency, fincra_id, status) VALUES ($1,'USD',$2,$3) ON CONFLICT (client_id, currency) DO UPDATE SET fincra_id = EXCLUDED.fincra_id, status = EXCLUDED.status, reason = NULL, account = '{}'::jsonb, updated_at = now()", [id, d._id ?? d.id ?? null, d.status ?? 'pending'])
    return { ok: true, status: d.status ?? 'pending' }
  }
  if (a === 'fincra_withdraw') {
    const cur = s('currency') === 'USD' ? 'USD' : 'NGN', amt = Number(b.amount)
    if (!(amt > 0) || !s('bank_details', 500)) throw apiError('invalid', 'Enter the amount and the bank account to pay into.')
    const bal = Number((await db().query<{ b: string }>("SELECT coalesce(sum(CASE WHEN kind IN ('withdrawal','fee') THEN -amount ELSE amount END), 0)::text AS b FROM wm.wallet_txns WHERE client_id = $1 AND currency = $2 AND status = 'confirmed'", [id, cur])).rows[0]?.b ?? 0)
    if (amt > bal) throw apiError('invalid', 'That is more than your available balance.')
    await db().query("INSERT INTO wm.wallet_txns (client_id, currency, kind, amount, status, source, detail, created_by) VALUES ($1,$2,'withdrawal',$3,'requested','request',$4,$5)", [id, cur, amt, JSON.stringify({ bank_details: s('bank_details', 500) }), user.userId])
    return { ok: true }
  }
  if (a === 'busha_quote' || a === 'busha_trade') {
    const asset = s('asset', 10).toUpperCase(), side = s('side') === 'sell' ? 'sell' : 'buy', amount = Number(b.amount)
    if (!/^[A-Z]{2,6}$/.test(asset) || !(amount > 0)) throw apiError('invalid', 'Choose the coin and amount.')
    const q = await busha('/v1/quotes', 'POST', side === 'buy' ? { source_currency: 'NGN', target_currency: asset, source_amount: String(amount) } : { source_currency: asset, target_currency: 'NGN', source_amount: String(amount) })
    if (a === 'busha_quote') return { ok: true, quote: q.data ?? q }
    const t = await busha('/v1/transfers', 'POST', { quote_id: (q.data ?? q).id })
    const units = Number((q.data ?? q).target_amount ?? 0), ngn = side === 'buy' ? amount : Number((q.data ?? q).target_amount ?? 0)
    await db().query("INSERT INTO wealth.holdings (entity_id, client_name, section, category, name, platform, currency, cost, current_value, status, as_of, notes, meta, in_nav, in_aum, wm_client_id, created_by) SELECT entity_id, name, 'client', 'crypto', $2, 'Busha', 'NGN', $3, $3, 'active', current_date, $4, $5, false, true, id, $6 FROM wm.clients WHERE id = $1",
      [id, asset + (side === 'buy' ? ' (bought)' : ' (sold)'), ngn, 'Busha ' + side + ' · ' + ((t.data ?? t).id ?? ''), JSON.stringify({ symbol: asset, units: side === 'buy' ? units : -amount, busha_ref: (t.data ?? t).id ?? null }), user.userId])
    await audit({ event, actorUserId: user.userId, action: 'wm.busha_' + side, objectType: 'wm_client', objectId: id, detail: { asset, amount } })
    return { ok: true, trade: t.data ?? t }
  }
  if (a === 'savings_request') {
    if (!r.savings) throw apiError('off', 'Savings plans are not switched on for this account.', 400)
    const plan = s('plan_id'), amt = Number(b.amount), kind = s('kind') === 'withdrawal' ? 'withdrawal' : 'deposit'
    if (!(amt > 0) || !(await db().query('SELECT 1 FROM wm.savings_plans WHERE id = $1 AND client_id = $2', [plan, id])).rowCount) throw apiError('invalid', 'Choose the plan and amount.')
    await db().query("INSERT INTO wm.savings_txns (plan_id, kind, amount, status, note, created_by) VALUES ($1,$2,$3,'requested',$4,$5)", [plan, kind, amt, s('note', 300) || null, user.userId])
    return { ok: true }
  }
  throw apiError('invalid', 'Unknown action.')
})
