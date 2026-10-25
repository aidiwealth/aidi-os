// Finvry Banking (read-only foundations). One ledger of every bank transaction, whatever rail it came from
// (the bank feed today, uploaded statements for banks the feed does not reach, Fincra later), each tied to a vendor and
// a category the founder can correct once for good; and from it the spend view and the cut list: recurring payments
// ranked by the runway they would give back. Nothing here moves money.
import { isCard, isDebt, CARD_PAY } from '~/shared/bank'
import { createHash } from 'node:crypto'
import { deriveLines, withSecurities, keyFigures, type FinRow } from '~/shared/fin-view'

// The rails: one contract, an adapter per provider, so pages never depend on which one a company uses.
export interface RailTxn { entity?: string | null; spender?: string | null; balance?: number | null; category?: string; ref: string; date: string; description: string; vendor?: string | null; amount: number; currency: string; account: string; bank_category?: string | null }
export interface Rail { key: 'bank_feed' | 'upload' | 'fincra'; label: string; note: string; available: () => Promise<boolean>; pull?: (from: string) => Promise<RailTxn[]> }
interface PTxn { transaction_id: string; account_id: string; amount: number; date: string; pending: boolean; name: string; merchant_name?: string | null; iso_currency_code: string | null; unofficial_currency_code: string | null; personal_finance_category?: { primary?: string } | null }
export const RAILS: Rail[] = [
  { key: 'bank_feed', label: 'Bank feed', note: 'Connected bank accounts, read-only, refreshed when you open the page.', available: async () => plaidOn() && !!(await db().query("SELECT 1 FROM banking.plaid_items WHERE wm_client_id IS NULL LIMIT 1")).rowCount,
    pull: async (from) => {
      const items = (await db().query<{ id: string; access_token_enc: string; institution: string | null; entity_id: string | null }>('SELECT id, access_token_enc, institution, entity_id FROM banking.plaid_items WHERE wm_client_id IS NULL AND error IS NULL')).rows
      const out: RailTxn[] = [], to = new Date().toISOString().slice(0, 10), cardKeys = await cardIssuerKeys()
      for (const it of items) {
        const accts = new Map((await db().query<{ account_id: string; name: string; mask: string | null; type: string | null; subtype: string | null }>('SELECT account_id, name, mask, type, subtype FROM banking.plaid_accounts WHERE item_id = $1', [it.id])).rows.map((a) => [a.account_id, a]))
        for (let off = 0; off < 5000; off += 500) {
          const j = await plaid<{ transactions: PTxn[]; total_transactions: number }>('/transactions/get', { access_token: decryptText(it.access_token_enc), start_date: from, end_date: to, options: { count: 500, offset: off } })
          for (const t of j.transactions) {
            const a = accts.get(t.account_id)
            // Cards are in (their purchases are the spend); loans are not. A card's bill being paid is a transfer
            // between the company's own accounts, on the card side and on the bank side.
            if (t.pending || !a || (isDebt(a) && !isCard(a))) continue
            const card = isCard(a), cardPay = card ? t.amount < 0 && CARD_PAY.test(t.name) : t.amount > 0 && cardKeys.some((k) => vendorKey(t.name, t.merchant_name).key.startsWith(k)) && (CARD_PAY.test(t.name) || ['LOAN_PAYMENTS', 'TRANSFER_OUT'].includes(t.personal_finance_category?.primary ?? ''))
            // The bank reports money out as a positive amount.
            out.push({ entity: it.entity_id, ref: t.transaction_id, date: t.date, description: t.name, vendor: t.merchant_name ?? null, amount: -t.amount, currency: t.iso_currency_code || t.unofficial_currency_code || 'USD', account: (it.institution ?? 'Bank') + ' · ' + a.name + (a.mask ? ' ··' + a.mask : ''), bank_category: t.personal_finance_category?.primary ?? null, category: cardPay ? 'transfer' : card && t.amount < 0 ? 'other_income' : undefined })
          }
          if (off + 500 >= j.total_transactions || !j.transactions.length) break
        }
      }
      return out
    } },
  { key: 'upload', label: 'Statement upload', note: 'Drag in CSV or PDF statements (PDFs read with AI), or link a Google Sheet of transactions, for banks the feed does not reach (most Nigerian banks today).', available: async () => true },
  { key: 'fincra', label: 'Money Movement', note: 'Accounts, payouts and cards services are coming soon; not connected yet.', available: async () => false }]

// "POS DEBIT 2093 AMAZON WEB SERVICES AWS.AMAZON.CO" → "amazon web services".
const NOISE = /\b(pos|debit|credit|card|purchase|payment|pymt|pmt|ach|trf|transfer|nip|web|online|recurring|autopay|ref|txn|trx|visa|mastercard|mc|chk|checkout|ltd|limited|llc|inc|plc|co|com|ng|us|www|https?)\b/g
export function vendorKey(desc: string, merchant?: string | null): { key: string; name: string } {
  const src = (merchant || desc).toLowerCase()
  const k = src.replace(/[*#:/\\|_.,@-]+/g, ' ').replace(/\d+/g, ' ').replace(NOISE, ' ').replace(/\s+/g, ' ').trim().split(' ').filter((w, i, all) => w.length > 1 && all.indexOf(w) === i).slice(0, 3).join(' ') || 'other'
  const name = merchant?.trim() || k.replace(/\b\w/g, (c) => c.toUpperCase())
  return { key: k.slice(0, 80), name: name.slice(0, 120) }
}
// Categories: the standard lines a payment counts under, before the founder corrects anything.
export const STD_CATS: { key: string; label: string; dir: 'in' | 'out' | 'any' }[] = [
  { key: 'revenue', label: 'Revenue (customer receipts)', dir: 'in' }, { key: 'financing', label: 'Funding and loans received', dir: 'in' }, { key: 'other_income', label: 'Other income', dir: 'in' },
  { key: 'cogs', label: 'Cost of revenue', dir: 'out' }, { key: 'opex_payroll', label: 'Payroll', dir: 'out' }, { key: 'opex_marketing', label: 'Sales & marketing', dir: 'out' }, { key: 'opex_rnd', label: 'Product & engineering', dir: 'out' },
  { key: 'opex_ga', label: 'General & admin', dir: 'out' }, { key: 'opex_other', label: 'Other operating costs', dir: 'out' }, { key: 'tax', label: 'Tax', dir: 'out' }, { key: 'interest', label: 'Interest and loan payments', dir: 'out' },
  { key: 'capex', label: 'Equipment and capex', dir: 'out' }, { key: 'transfer', label: 'Transfer between own accounts or group companies', dir: 'any' },
  { key: 'investment', label: 'Investment bought, sold or matured', dir: 'any' }]
const KW: [RegExp, string][] = [
  [/\b(aws|amazon web|google cloud|gcp|azure|digitalocean|vercel|heroku|cloudflare|netlify|render|github|gitlab|atlassian|jira|figma|openai|anthropic|twilio|sentry|datadog|mongodb|supabase|linear)\b/, 'opex_rnd'],
  [/\b(google ads|facebook|meta|linkedin|twitter|x ads|tiktok|hubspot|mailchimp|sendgrid|brevo|semrush|ahrefs|canva|apollo|clay)\b/, 'opex_marketing'],
  [/\b(salary|salaries|payroll|gusto|deel|rippling|remote com|oyster|paye|pension|nhf|wages|justworks)\b/, 'opex_payroll'],
  [/\b(rent|lease|office|wework|regus|legal|attorney|lawyer|accounting|audit|insurance|notion|slack|zoom|google workspace|gsuite|microsoft|dropbox|docusign|quickbooks|xero|stripe fee|bank charge|charges|fee|fees|stamp duty|vat on)\b/, 'opex_ga'],
  [/\b(tax|irs|firs|lirs|withholding)\b/, 'tax'], [/\b(interest|loan repayment|loan rep)\b/, 'interest']]
const PLAID_CAT: Record<string, string> = { RENT_AND_UTILITIES: 'opex_ga', BANK_FEES: 'opex_ga', LOAN_PAYMENTS: 'interest', TRAVEL: 'opex_ga', FOOD_AND_DRINK: 'opex_other', GENERAL_SERVICES: 'opex_other', GENERAL_MERCHANDISE: 'opex_other', GOVERNMENT_AND_NON_PROFIT: 'tax', TRANSFER_OUT: 'transfer', TRANSFER_IN: 'transfer', INCOME: 'revenue' }
export function autoCategory(vkey: string, desc: string, dir: 'in' | 'out', bank: string | null): string {
  const s = (vkey + ' ' + desc).toLowerCase()
  if (/\b(own account|between accounts|self transfer|sweep)\b/.test(s)) return 'transfer'
  if (dir === 'in') return /\b(loan|disburse|safe|investment|capital|equity|grant)\b/.test(s) ? 'financing' : /\binterest\b/.test(s) ? 'other_income' : bank && PLAID_CAT[bank] === 'transfer' ? 'transfer' : 'revenue'
  for (const [re, c] of KW) if (re.test(s)) return c
  return (bank && PLAID_CAT[bank]) || 'opex_other'
}

// Bring transactions in: the vendor, the category (the founder's rule for that vendor first), and the amounts in the
// company's currency and in US dollars. Already-seen transactions are left as they are.
// The company's own names (the company, its subsidiaries, the organisation): money moving between them is a transfer
// between the group's own accounts, never a vendor, a cost or revenue.
export async function ownNames(): Promise<RegExp | null> {
  const org = await currentOrg()
  const names = [org?.name ?? '', ...(await db().query<{ name: string; legal_name: string | null }>('SELECT name, legal_name FROM core.entities').catch(() => ({ rows: [] }))).rows.flatMap((e) => [e.name, e.legal_name ?? ''])]
  const keys = [...new Set(names.map((n) => vendorKey(n).key).filter((k) => k && k !== 'other' && k.length >= 4))]
  return keys.length ? new RegExp('^(' + keys.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+')).join('|') + ')(\\b|$)') : null
}
// The payee is one of the company's own names: judged on the payee (the vendor key, after "to" / "from"), not on any
// mention in the narration, so a customer's payment that names the company is still revenue.
export const isOwn = (own: RegExp | null, vkey: string) => !!own && own.test(vkey.replace(/^(to|from|for|by|tfr)\s+/, ''))
// Uploaded transactions already in the ledger (same account, date, description and amount), counted, so statements
// that overlap (Jan–Jun and Apr–Dec), the same file twice, or a sheet and a statement of the same account never count
// a payment twice.
export async function notYetIn(txns: RailTxn[], entityId: string | null): Promise<RailTxn[]> {
  if (!txns.length) return []
  const k = (a: string, d: string, desc: string, amt: number) => [a.toLowerCase().trim(), d, desc.slice(0, 500).toLowerCase().trim(), (Math.round(amt * 100) / 100).toFixed(2)].join('|')
  const accts = [...new Set(txns.map((t) => t.account.slice(0, 160)))], dates = txns.map((t) => t.date).sort()
  const have = new Map<string, number>()
  for (const r of (await db().query<{ account_label: string | null; d: string; description: string; amt: string; direction: string }>(
    "SELECT account_label, txn_date::text AS d, description, amount::text AS amt, direction FROM banking.ledger WHERE source IN ('upload', 'bank_feed') AND account_label = ANY($1::text[]) AND txn_date BETWEEN $2 AND $3 AND entity_id IS NOT DISTINCT FROM $4",
    [accts, dates[0], dates[dates.length - 1], entityId])).rows) { const x = k(r.account_label ?? '', r.d, r.description, (r.direction === 'out' ? -1 : 1) * Number(r.amt)); have.set(x, (have.get(x) ?? 0) + 1) }
  const out: RailTxn[] = []
  for (const t of txns) { const x = k(t.account.slice(0, 160), t.date, t.description, t.amount), n = have.get(x) ?? 0; if (n > 0) have.set(x, n - 1); else out.push(t) }
  return out
}
export async function addToLedger(source: Rail['key'] | 'statement', txns0: RailTxn[], entityId: string | null, uploadId: string | null = null): Promise<number> {
  const txns = source === 'upload' ? await notYetIn(txns0.map((t) => ({ ...t, entity: t.entity ?? entityId })), entityId) : txns0
  const own = await ownNames()
  const org = await currentOrg(), base = ((org?.settings.reporting_currency as string) || (org?.settings.currency as string) || 'USD')
  const rules = new Map((await db().query<{ vendor_key: string; category: string }>('SELECT vendor_key, category FROM banking.category_rules')).rows.map((r) => [r.vendor_key, r.category]))
  const broker = new Set((await db().query<{ label: string }>("SELECT account_label AS label FROM banking.account_settings WHERE kind = 'brokerage'").catch(() => ({ rows: [] }))).rows.map((r) => r.label))
  const aiRules = new Map((await db().query<{ k: string; category: string }>("SELECT vendor_key || '|' || direction AS k, category FROM banking.ai_rules WHERE category IS NOT NULL").catch(() => ({ rows: [] }))).rows.map((r) => [r.k, r.category]))
  const rate = new Map<string, number | null>(), fx = async (a: string, b: string) => { if (a === b) return 1; const k = a + b; if (!rate.has(k)) rate.set(k, await fxRate(a, b)); return rate.get(k) ?? null }
  let n = 0
  for (const t of txns) {
    if (!t.amount) continue
    const dir = t.amount < 0 ? 'out' : 'in', amt = Math.abs(t.amount), v = vendorKey(t.description, t.vendor)
    // In a brokerage account, buying, selling and maturities move money between cash and holdings (brokerage.ts).
    const bk = broker.has(t.account) ? brokerageCategory(t.description) : null
    const rule = rules.get(v.key), own1 = !rule && !t.category && !bk && isOwn(own, v.key), ai = !rule && !t.category && !own1 && !bk ? aiRules.get(v.key + '|' + dir) : undefined
    const cat = rule ?? t.category ?? bk ?? (own1 ? 'transfer' : ai ?? autoCategory(v.key, t.description, dir, t.bank_category ?? null))
    const kb = await fx(t.currency, base), ku = await fx(t.currency, 'USD')
    const r = await db().query(`INSERT INTO banking.ledger (entity_id, source, source_ref, account_label, txn_date, description, vendor_key, vendor, direction, amount, currency, amount_base, base_currency, amount_usd, category, category_by, bank_category, spender, upload_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) ON CONFLICT (organization_id, source, source_ref) DO NOTHING`,
      [t.entity ?? entityId, source, t.ref.slice(0, 200), t.account.slice(0, 160), t.date, t.description.slice(0, 500), v.key, v.name, dir, amt, t.currency, Math.round(amt * (kb ?? 1) * 100) / 100, kb === null ? t.currency : base, ku === null ? null : Math.round(amt * ku * 100) / 100, cat, rule ? 'rule' : ai ? 'ai' : 'auto', t.bank_category ?? null, t.spender ?? null, uploadId])
    n += r.rowCount ?? 0
  }
  return n
}
export const uploadRef = (account: string, t: { date: string; description: string; amount: number; balance: number | null }, i: number) => createHash('sha1').update([account, t.date, t.description, t.amount, t.balance ?? '', i].join('|')).digest('hex')

// Money moved between the company's own accounts (a payout from a payment processor's balance to the bank, one bank to
// another, a group company funding another): neither revenue nor spend. Two ways to see it:
//  1. a payment out of one own account and the same amount into another own account (same currency) within three days;
//  2. money in that names a payment processor the company itself holds an account with (its settlement payouts).
// Only rows still on the automatic category change; amounts under 50 are left alone (too many coincidences).
const PROCESSORS = ['paystack', 'monnify', 'flutterwave', 'paga', 'opay', 'palmpay', 'moniepoint', 'squad', 'korapay', 'interswitch', 'remita', 'stripe', 'payoneer', 'wise', 'fincra', 'kuda']
export async function pairTransfers(): Promise<number> {
  const paired = await db().query(`WITH c AS (
      SELECT o.id AS oid, i.id AS iid,
             row_number() OVER (PARTITION BY o.id ORDER BY abs(i.txn_date - o.txn_date), i.id) AS ro,
             row_number() OVER (PARTITION BY i.id ORDER BY abs(i.txn_date - o.txn_date), o.id) AS ri
        FROM banking.ledger o JOIN banking.ledger i
          ON i.organization_id = o.organization_id AND i.direction = 'in' AND i.currency = o.currency AND i.amount = o.amount
         AND i.account_label IS DISTINCT FROM o.account_label AND abs(i.txn_date - o.txn_date) <= 3
       WHERE o.direction = 'out' AND o.amount >= 50 AND o.category_by IN ('auto', 'ai') AND i.category_by IN ('auto', 'ai')
         AND coalesce(o.category, '') NOT IN ('transfer', 'investment') AND coalesce(i.category, '') NOT IN ('transfer', 'investment'))
    UPDATE banking.ledger SET category = 'transfer', category_by = 'auto' WHERE id IN (SELECT oid FROM c WHERE ro = 1 AND ri = 1 UNION ALL SELECT iid FROM c WHERE ro = 1 AND ri = 1)`)
  const held = (await db().query<{ w: string }>("SELECT DISTINCT lower(split_part(account_label, ' ', 1)) AS w FROM banking.ledger WHERE account_label IS NOT NULL")).rows.map((r) => r.w).filter((w) => PROCESSORS.includes(w))
  const settled = held.length ? await db().query(`UPDATE banking.ledger SET category = 'transfer', category_by = 'auto' WHERE direction = 'in' AND category_by IN ('auto', 'ai') AND coalesce(category, '') NOT IN ('transfer', 'investment')
      AND lower(split_part(coalesce(account_label, ''), ' ', 1)) <> ALL($1::text[]) AND (description ~* $2 OR vendor_key ~* $2)`, [held, '\\m(' + held.join('|') + ')\\M']) : null
  return (paired.rowCount ?? 0) + (settled?.rowCount ?? 0)
}

// Transactions brought in before the company's own names were recognised: moved to transfers (unless the founder chose
// their category), so the company never shows up as its own vendor or customer.
export async function fixOwnTransfers() {
  const own = await ownNames(); if (!own) return 0
  const rows = (await db().query<{ id: string; vendor_key: string }>("SELECT id, vendor_key FROM banking.ledger WHERE category_by IN ('auto', 'ai') AND coalesce(category, '') NOT IN ('transfer', 'investment')")).rows.filter((r) => isOwn(own, r.vendor_key))
  if (rows.length) await db().query("UPDATE banking.ledger SET category = 'transfer', category_by = 'auto' WHERE id = ANY($1::uuid[])", [rows.map((r) => r.id)])
  return rows.length
}
// Connected cards: their names as the ledger shows them, and their issuers (Brex, Amex…) as payees, so paying the card's
// bill from the bank is a transfer, not spend (the card's own purchases are the spend).
export async function cardLabels(): Promise<string[]> {
  return (await db().query<{ label: string }>("SELECT coalesce(i.institution, 'Bank') || ' · ' || a.name || coalesce(' ··' || a.mask, '') AS label FROM banking.plaid_accounts a JOIN banking.plaid_items i ON i.id = a.item_id WHERE i.wm_client_id IS NULL AND (a.type = 'credit' OR a.subtype = 'credit card')").catch(() => ({ rows: [] }))).rows.map((r) => r.label)
}
export async function debtLabels(): Promise<Set<string>> {
  return new Set((await db().query<{ label: string; type: string | null; subtype: string | null }>("SELECT coalesce(i.institution, 'Bank') || ' · ' || a.name || coalesce(' ··' || a.mask, '') AS label, a.type, a.subtype FROM banking.plaid_accounts a JOIN banking.plaid_items i ON i.id = a.item_id WHERE i.wm_client_id IS NULL").catch(() => ({ rows: [] }))).rows.filter(isDebt).map((r) => r.label))
}
export async function cardIssuerKeys(): Promise<string[]> {
  const r = (await db().query<{ institution: string | null }>("SELECT DISTINCT i.institution FROM banking.plaid_accounts a JOIN banking.plaid_items i ON i.id = a.item_id WHERE i.wm_client_id IS NULL AND (a.type = 'credit' OR a.subtype = 'credit card')").catch(() => ({ rows: [] }))).rows
  return [...new Set(r.map((x) => vendorKey(x.institution ?? '').key).filter((k) => k && k !== 'other'))]
}
// Card bills paid from the bank before the card was connected: moved to transfers (unless the founder chose).
export async function fixCardPayments() {
  const keys = await cardIssuerKeys(); if (!keys.length) return 0
  const cards = await cardLabels()
  const rows = (await db().query<{ id: string; vendor_key: string; description: string }>("SELECT id, vendor_key, description FROM banking.ledger WHERE category_by IN ('auto', 'ai') AND direction = 'out' AND coalesce(category, '') NOT IN ('transfer', 'investment') AND NOT (account_label = ANY($1::text[]))", [cards])).rows
    .filter((r) => keys.some((k) => r.vendor_key.startsWith(k)))
  if (rows.length) await db().query("UPDATE banking.ledger SET category = 'transfer', category_by = 'auto' WHERE id = ANY($1::uuid[])", [rows.map((r) => r.id)])
  return rows.length
}
// The bank feed, pulled at most every six hours (twelve months the first time).
// The live bank feed: incremental, per connection (plaid-sync.ts). Kept under this name for the pages and jobs that
// call it.
export async function syncBankFeed(force = false): Promise<number> { return syncPlaidItems(force) }

// Cash and burn on the same basis as Financials and the Stage Monitor, for the runway each cut gives back.
// keyFigures: the one cash, burn and runway shown on every page.
export async function cashAndBurn(cur: string, subject?: string): Promise<{ cash: number | null; burn: number | null; runway: number | null; cash_at: string | null; investments: number; runway_to: string | null }> {
  const ent = await companyEntityId(), subj = subject ?? (ent ? 'entity:' + ent : null)
  if (!subj) return { cash: null, burn: null, runway: null, cash_at: null, investments: 0, runway_to: null }
  const rows = (await loadStatements(subj, 'month', cur).catch(() => [])).filter((r) => r.period_type === 'month').slice(-12)
  const sec = await cashPolicy()
  const k = keyFigures(rows.map((r) => ({ period_end: r.period_end, period_type: 'month', currency: r.currency, lines: r.lines, kpis: {}, derived: withSecurities(deriveLines(r.lines, 1), sec) })) as FinRow[])
  return { cash: k.cash, burn: k.burn, runway: k.runway, cash_at: k.cash_at, investments: k.investments, runway_to: k.runway_to }
}

// Tools that do the same job: two or more of them paid every month is worth a look.
const SAME_JOB: [string, RegExp][] = [['Video calls', /\b(zoom|google meet|teams|webex|whereby)\b/], ['Team chat', /\b(slack|teams|discord|chanty)\b/], ['Docs and wiki', /\b(notion|confluence|coda|clickup|google workspace)\b/],
  ['File storage', /\b(dropbox|box|google one|onedrive)\b/], ['CRM', /\b(hubspot|salesforce|pipedrive|zoho|close)\b/], ['Email sending', /\b(mailchimp|sendgrid|brevo|mailgun|postmark|resend)\b/],
  ['Design', /\b(figma|canva|adobe|sketch)\b/], ['Code hosting', /\b(github|gitlab|bitbucket)\b/], ['Cloud hosting', /\b(aws|amazon web|google cloud|azure|digitalocean|vercel|heroku|render|netlify)\b/], ['Project tracking', /\b(jira|linear|asana|trello|monday|clickup)\b/]]

export interface Vendor { key: string; name: string; category: string | null; months: Record<string, number>; total: number; monthly: number; recurring: boolean; last: string; status: string; remind_on: string | null; note: string | null; saving_pct: number | null; suggest?: { flag: string; why: string } | null }
// Spend that looks personal, and money sent through transfer services (no clear payee): flagged for a look, the way
// founders do it in their own cut-list sheets.
const PERSONAL = /\b(spa|salon|barber|fitness|gym|netflix|spotify|disney|hulu|playstation|xbox|brewery|pub|liquor|wine shop|cinema|experian|credit karma|dating|uber eats|doordash|grubhub|deliveroo|glovo|chowdeck)\b/
const PAYROLL = /\b(payroll|salar|wages|deel|gusto|rippling|raenest|oyster|remote com|seamlesshr|paystack payroll)/
const TRANSFER = /\b(wise|transferwise|paypal|payoneer|remitly|western union|moneygram|venmo|cash app|zelle|revolut|grey|chipper)\b/
// What a flag saves a month: cut and personal the whole payment, a downgrade its saving share (half unless set).
export const savingOf = (v: { status: string; monthly: number; saving_pct: number | null }) => (v.status === 'to_cancel' || v.status === 'personal' ? v.monthly * (v.saving_pct ?? 100) / 100 : v.status === 'downgrade' ? v.monthly * (v.saving_pct ?? 50) / 100 : 0)
// The spend view and the cut list, in the company's currency, from the last twelve months of the ledger.
// The ledger for the company chosen at the top (transactions without a company count as the main one's), or every
// company's for the group; amounts in that company's currency, or the group's reporting currency.
export interface TScope { group: boolean; entity: string | null; currency: string }
export async function rateTo(cur: string) { const m = new Map<string, number>(); return async (c: string) => { if (c === cur) return 1; if (!m.has(c)) m.set(c, (await fxRate(c, cur)) ?? 0); return m.get(c)! } }
export async function treasuryView(sc: TScope) {
  const cur = sc.currency, rate = await rateTo(cur), main = await companyEntityId(), ent = sc.group ? null : sc.entity
  const raw = (await db().query<{ m: string; vendor_key: string; vendor: string; direction: string; category: string | null; currency: string; amt: string; last: string }>(
    `SELECT to_char(txn_date, 'YYYY-MM') AS m, vendor_key, max(vendor) AS vendor, direction, category, currency, sum(amount)::text AS amt, max(txn_date)::text AS last FROM banking.ledger
     WHERE txn_date >= date_trunc('month', now()) - interval '12 months' AND coalesce(category, '') NOT IN ('transfer', 'investment') AND ($1::uuid IS NULL OR coalesce(entity_id, $2::uuid) = $1) GROUP BY 1, 2, 4, 5, 6`, [ent, main])).rows
  const rows: { m: string; vendor_key: string; vendor: string; direction: string; category: string | null; amt: string; last: string }[] = []
  for (const r of raw) rows.push({ ...r, amt: String(Number(r.amt) * await rate(r.currency)) })
  const thisM = new Date().toISOString().slice(0, 7), full = [...new Set(rows.map((r) => r.m))].filter((m) => m < thisM).sort()
  const last3 = full.slice(-3), lastM = full[full.length - 1] ?? null, prevM = full[full.length - 2] ?? null
  const months: Record<string, { in: number; out: number }> = {}, cats: Record<string, Record<string, number>> = {}
  const vend = new Map<string, Vendor>()
  for (const r of rows) {
    const a = Number(r.amt); (months[r.m] ??= { in: 0, out: 0 })[r.direction as 'in' | 'out'] += a
    if (r.direction !== 'out') continue
    const c = r.category ?? 'opex_other'; (cats[c] ??= {})[r.m] = (cats[c]![r.m] ?? 0) + a
    const v = vend.get(r.vendor_key) ?? { key: r.vendor_key, name: r.vendor, category: c, months: {}, total: 0, monthly: 0, recurring: false, last: r.last, status: 'keep', remind_on: null, note: null, saving_pct: null }
    v.months[r.m] = (v.months[r.m] ?? 0) + a; v.total += a; if (r.last > v.last) v.last = r.last; vend.set(r.vendor_key, v)
  }
  const st = new Map((await db().query<{ vendor_key: string; status: string; remind_on: string | null; note: string | null; saving_pct: number | null }>("SELECT vendor_key, status, to_char(remind_on, 'YYYY-MM-DD') AS remind_on, note, saving_pct::float FROM banking.vendors")).rows.map((r) => [r.vendor_key, r]))
  const med = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)]! : 0 }
  // Recurring: paid in at least three of the last four full months (or every one of them when there are fewer).
  const last4 = full.slice(-4)
  for (const v of vend.values()) {
    const paid = last4.filter((m) => (v.months[m] ?? 0) > 0)
    v.recurring = last4.length >= 2 && paid.length >= Math.min(3, last4.length) && (v.months[thisM] !== undefined || paid.includes(lastM ?? ''))
    v.monthly = Math.round(med(last3.map((m) => v.months[m] ?? 0).filter((x) => x > 0)) * 100) / 100
    const s = st.get(v.key); if (s) { v.status = s.status; v.remind_on = s.remind_on; v.note = s.note; v.saving_pct = s.saving_pct }
  }
  const cb = await cashAndBurn(cur, sc.group ? 'group' : ent ? 'entity:' + ent : undefined)
  // Bank burn when Financials has none: money out less money in, over the last three full months.
  const bankBurn = last3.length ? Math.max(0, last3.reduce((s, m) => s + (months[m]!.out - months[m]!.in), 0) / last3.length) : null
  // No cash in Financials yet: the bank's latest month-end cash (every account with a balance), marked as from the bank.
  const bc = cb.cash === null ? await bankCash(sc) : null
  const burn = cb.burn ?? bankBurn, cash = cb.cash ?? bc?.cash ?? null
  const runway = (b: number | null) => (cash === null || b === null ? null : b <= 0 ? null : Math.round(cash / b * 10) / 10)
  const now = runway(burn)
  // The month the cash is from, whether that month is marked reconciled, and the month it would run out.
  const cashMonth = cb.cash !== null ? cb.cash_at?.slice(0, 7) ?? null : bc?.month ?? null
  const reconciledCash = cashMonth ? !!(await db().query('SELECT 1 FROM banking.reconciled WHERE scope = $1 AND month = $2', [sc.group ? 'group' : ent ?? 'group', cashMonth]).catch(() => ({ rowCount: 0 }))).rowCount : false
  const runwayTo = (r: number | null) => { if (r === null || r >= 120 || !cashMonth) return null; const t = new Date(cashMonth + '-15T00:00:00Z'); t.setUTCMonth(t.getUTCMonth() + Math.floor(r)); return t.toISOString().slice(0, 7) }
  // Taxes, loan payments and transfers are not choices to cut.
  const recurring = [...vend.values()].filter((v) => v.recurring && v.monthly > 0 && !['tax', 'interest', 'transfer', 'investment', 'financing'].includes(v.category ?? '')).sort((a, b) => b.monthly - a.monthly)
  const dupes = SAME_JOB.map(([job, re]) => ({ job, vendors: recurring.filter((v) => re.test(v.key + ' ' + v.name.toLowerCase())).map((v) => ({ key: v.key, name: v.name, monthly: v.monthly })) })).filter((g) => g.vendors.length > 1)
  // A suggested flag for each recurring payment (the founder decides): personal-looking, transfers with no clear payee,
  // a second tool for the same job, a bill rising fast, the largest bill.
  const recTotal = recurring.reduce((s, v) => s + v.monthly, 0)
  for (const v of recurring) {
    const t = v.key + ' ' + v.name.toLowerCase(), dup = dupes.find((g) => g.vendors.some((x) => x.key === v.key)), lastV = lastM ? v.months[lastM] ?? 0 : 0
    v.suggest = PERSONAL.test(t) ? { flag: 'personal', why: 'Looks personal: take it off the company card or have it paid back.' }
      : TRANSFER.test(t) ? { flag: 'review', why: 'Money sent through a transfer service: confirm who it goes to and why.' }
      : dup && dup.vendors[0]!.key !== [...dup.vendors].sort((a, b) => b.monthly - a.monthly)[0]!.key && dup.vendors.filter((x) => x.monthly > v.monthly).length ? { flag: 'to_cancel', why: dup.vendors.filter((x) => x.key !== v.key).map((x) => x.name).join(', ') + ' already ' + (dup.vendors.length > 2 ? 'do' : 'does') + ' ' + dup.job.toLowerCase() + '.' }
      : v.monthly > 0 && lastV > v.monthly * 1.5 && lastV - v.monthly > recTotal * 0.02 ? { flag: 'review', why: 'Up ' + Math.round((lastV / v.monthly - 1) * 100) + '% on its usual month: check usage and billing.' }
      : recTotal && v.monthly >= recTotal * 0.2 && !PAYROLL.test(t) && v.category !== 'opex_payroll' ? { flag: 'downgrade', why: 'One of the largest bills: negotiate, move to invoiced billing, or trim usage or seats.' } : null
  }
  const cut = recurring.filter((v) => v.status !== 'cancelled').map((v) => { const save = savingOf(v) || v.monthly, after = burn === null ? null : burn - save; return { ...v, saving: Math.round(savingOf(v) * 100) / 100, runway_gain: now === null || after === null ? null : after <= 0 ? 'stops the burn' : Math.round((runway(after)! - now) * 10) / 10 } })
    .sort((a, b) => (typeof b.runway_gain === 'number' ? b.runway_gain : 999) - (typeof a.runway_gain === 'number' ? a.runway_gain : 999)).slice(0, 60)
  const marked = recurring.reduce((s, v) => s + savingOf(v), 0)
  // Payments worth a look (last 90 days): far above what that payee usually takes, round-number transfers, a new
  // payee taking a lot, personal-looking spend.
  const pays = (await db().query<{ id: string; d: string; vendor_key: string; vendor: string; description: string; currency: string; amount: number; spender: string | null }>(
    `SELECT id, txn_date::text AS d, vendor_key, vendor, description, currency, amount::float, spender FROM banking.ledger WHERE direction = 'out' AND txn_date >= now() - interval '90 days' AND coalesce(category, '') NOT IN ('tax', 'interest')
     AND ($1::uuid IS NULL OR coalesce(entity_id, $2::uuid) = $1) ORDER BY txn_date DESC LIMIT 4000`, [ent, main])).rows
  const seenBefore = new Set((await db().query<{ vendor_key: string }>("SELECT DISTINCT vendor_key FROM banking.ledger WHERE direction = 'out' AND txn_date < now() - interval '30 days' AND ($1::uuid IS NULL OR coalesce(entity_id, $2::uuid) = $1)", [ent, main])).rows.map((r) => r.vendor_key))
  const outMonth = last3.length ? last3.reduce((s, m) => s + months[m]!.out, 0) / last3.length : 0
  const byV = new Map<string, number[]>(); for (const p of pays) { p.amount = p.amount * await rate(p.currency); (byV.get(p.vendor_key) ?? byV.set(p.vendor_key, []).get(p.vendor_key)!).push(p.amount) }
  const checks: { id: string; date: string; vendor: string; amount: number; spender: string | null; why: string; count: number }[] = [], ck = new Map<string, (typeof checks)[number]>()
  for (const p of pays) {
    // Transfers between the company's own accounts are not spend; only transfer services are looked at.
    if ((p.vendor_key + ' ' + p.vendor.toLowerCase()).match(TRANSFER) === null && /transfer/.test(p.description.toLowerCase()) && !p.spender) continue
    const t = p.vendor_key + ' ' + p.vendor.toLowerCase(), others = (byV.get(p.vendor_key) ?? []).filter((x) => x !== p.amount), usual = med(others)
    const why = others.length >= 2 && usual > 0 && p.amount > usual * 5 && p.amount - usual > outMonth * 0.01 ? 'About ' + Math.round(p.amount / usual) + '× what this payee usually takes'
      : TRANSFER.test(t) && Math.round(p.amount) % 50 === 0 && p.amount >= 200 ? 'Round-number transfer with no clear payee'
      : TRANSFER.test(t) && pays.filter((q) => q.vendor_key === p.vendor_key && Math.abs(new Date(q.d).getTime() - new Date(p.d).getTime()) < 30 * 86400000).length >= 4 ? 'Frequent transfers with no clear payee'
      : PERSONAL.test(t) ? 'Looks personal'
      : !seenBefore.has(p.vendor_key) && outMonth && p.amount >= outMonth * 0.03 && Date.now() - new Date(p.d).getTime() < 30 * 86400000 ? 'New payee this month' : ''
    if (!why) continue
    // One line per payee and reason (the largest payment, with how many there were).
    const k = p.vendor_key + '|' + why, ex = ck.get(k)
    if (ex) { ex.count++; if (p.amount > ex.amount) Object.assign(ex, { id: p.id, date: p.d, amount: Math.round(p.amount * 100) / 100, spender: p.spender ?? ex.spender }) }
    else { const c = { id: p.id, date: p.d, vendor: p.vendor, amount: Math.round(p.amount * 100) / 100, spender: p.spender, why, count: 1 }; ck.set(k, c); checks.push(c) }
  }
  checks.sort((a, b) => b.amount - a.amount)
  // Who spends: card and expense exports name the person.
  const spend3 = new Map<string, number>(); for (const p of pays) if (p.spender) spend3.set(p.spender, (spend3.get(p.spender) ?? 0) + p.amount)
  const bySpender = [...spend3.entries()].map(([name, total]) => ({ name, total: Math.round(total), monthly: Math.round(total / 3) })).sort((a, b) => b.total - a.total).slice(0, 200)
  const budgets = new Map((await db().query<{ category: string; monthly: string }>('SELECT category, monthly FROM banking.budgets WHERE scope = $1', [sc.group ? 'group' : ent ?? 'group'])).rows.map((r) => [r.category, Number(r.monthly)]))
  const accts = (await listAccounts().catch(() => [])).map((a) => ({ key: 'cat:' + a.parent + ':' + a.name, label: a.name, parent: a.parent }))
  const catLabel = (k: string) => STD_CATS.find((c) => c.key === k)?.label ?? accts.find((a) => a.key === k)?.label ?? k
  const byCat = Object.entries(cats).map(([k, ms]) => ({ key: k, label: catLabel(k), last: lastM ? ms[lastM] ?? 0 : 0, prev: prevM ? ms[prevM] ?? 0 : 0, avg3: last3.reduce((s, m) => s + (ms[m] ?? 0), 0) / Math.max(1, last3.length), budget: budgets.get(k) ?? null })).sort((a, b) => b.avg3 - a.avg3)
  const topVendors = [...vend.values()].map((v) => ({ key: v.key, name: v.name, category: catLabel(v.category ?? 'opex_other'), last: lastM ? v.months[lastM] ?? 0 : 0, prev: prevM ? v.months[prevM] ?? 0 : 0, total: v.total, recurring: v.recurring })).sort((a, b) => b.total - a.total).slice(0, 200)
  const movers = [...vend.values()].map((v) => ({ name: v.name, last: lastM ? v.months[lastM] ?? 0 : 0, prev: prevM ? v.months[prevM] ?? 0 : 0 })).map((x) => ({ ...x, change: x.last - x.prev })).filter((x) => Math.abs(x.change) > 0).sort((a, b) => Math.abs(b.change) - Math.abs(a.change)).slice(0, 50)
  const count = (await db().query<{ n: number; first: string | null; sources: string[]; ai: number }>("SELECT count(*)::int AS n, min(txn_date)::text AS first, array_agg(DISTINCT source) AS sources, count(*) FILTER (WHERE category_by = 'ai')::int AS ai FROM banking.ledger WHERE ($1::uuid IS NULL OR coalesce(entity_id, $2::uuid) = $1)", [ent, main])).rows[0]!
  return { currency: cur, months: full.map((m) => ({ month: m, ...months[m]! })), last_month: lastM, prev_month: prevM,
    cash, cash_from: cb.cash !== null ? 'financials' : bc ? 'bank' : null, cash_month: cashMonth, cash_investments: cb.cash !== null ? cb.investments : 0, cash_reconciled: reconciledCash, runway_to: runwayTo(now), burn_from: cb.burn !== null ? 'financials' : bankBurn !== null ? 'bank' : null, burn, runway: now, marked_monthly: Math.round(marked * 100) / 100, runway_if_cut: marked && burn !== null ? (burn - marked <= 0 ? 'no longer burning' : runway(burn - marked)) : null,
    by_category: byCat, top_vendors: topVendors, movers, recurring_total: Math.round(recurring.reduce((s, v) => s + v.monthly, 0) * 100) / 100, cut_list: cut, duplicates: dupes, checks: checks.slice(0, 30), by_spender: bySpender,
    categories: [...STD_CATS.map((c) => ({ key: c.key, label: c.label })), ...accts.map((a) => ({ key: a.key, label: a.label + ' (' + (STD_CATS.find((c) => c.key === a.parent)?.label ?? a.parent) + ')' }))],
    ledger: { count: count.n, since: count.first, sources: count.sources ?? [], ai: count.ai } }
}
