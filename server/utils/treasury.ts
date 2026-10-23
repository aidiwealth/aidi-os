// Finvry Banking & Treasury (read-only foundations). One ledger of every bank transaction, whatever rail it came from
// (the bank feed today, uploaded statements for banks the feed does not reach, Fincra later), each tied to a vendor and
// a category the founder can correct once for good; and from it the spend view and the cut list: recurring payments
// ranked by the runway they would give back. Nothing here moves money.
import { createHash } from 'node:crypto'
import { deriveLines, withSecurities, burnReview, type FinRow } from '~/shared/fin-view'

// The rails: one contract, an adapter per provider, so pages never depend on which one a company uses.
export interface RailTxn { ref: string; date: string; description: string; vendor?: string | null; amount: number; currency: string; account: string; bank_category?: string | null }
export interface Rail { key: 'bank_feed' | 'upload' | 'fincra'; label: string; note: string; available: () => Promise<boolean>; pull?: (from: string) => Promise<RailTxn[]> }
interface PTxn { transaction_id: string; account_id: string; amount: number; date: string; pending: boolean; name: string; merchant_name?: string | null; iso_currency_code: string | null; unofficial_currency_code: string | null; personal_finance_category?: { primary?: string } | null }
export const RAILS: Rail[] = [
  { key: 'bank_feed', label: 'Bank feed', note: 'Connected bank accounts, read-only, refreshed when you open the page.', available: async () => plaidOn() && !!(await db().query("SELECT 1 FROM banking.plaid_items WHERE wm_client_id IS NULL LIMIT 1")).rowCount,
    pull: async (from) => {
      const items = (await db().query<{ id: string; access_token_enc: string; institution: string | null }>('SELECT id, access_token_enc, institution FROM banking.plaid_items WHERE wm_client_id IS NULL AND error IS NULL')).rows
      const out: RailTxn[] = [], to = new Date().toISOString().slice(0, 10)
      for (const it of items) {
        const accts = new Map((await db().query<{ account_id: string; name: string; mask: string | null; type: string | null; subtype: string | null }>('SELECT account_id, name, mask, type, subtype FROM banking.plaid_accounts WHERE item_id = $1', [it.id])).rows.map((a) => [a.account_id, a]))
        for (let off = 0; off < 5000; off += 500) {
          const j = await plaid<{ transactions: PTxn[]; total_transactions: number }>('/transactions/get', { access_token: decryptText(it.access_token_enc), start_date: from, end_date: to, options: { count: 500, offset: off } })
          for (const t of j.transactions) {
            const a = accts.get(t.account_id)
            if (t.pending || !a || ['credit', 'loan'].includes(a.type ?? '') || ['credit card', 'loan'].includes(a.subtype ?? '')) continue
            // The bank reports money out as a positive amount.
            out.push({ ref: t.transaction_id, date: t.date, description: t.name, vendor: t.merchant_name ?? null, amount: -t.amount, currency: t.iso_currency_code || t.unofficial_currency_code || 'USD', account: (it.institution ?? 'Bank') + ' · ' + a.name + (a.mask ? ' ··' + a.mask : ''), bank_category: t.personal_finance_category?.primary ?? null })
          }
          if (off + 500 >= j.total_transactions || !j.transactions.length) break
        }
      }
      return out
    } },
  { key: 'upload', label: 'Statement upload', note: 'CSV or PDF statements for banks the feed does not reach (most Nigerian banks today).', available: async () => true },
  { key: 'fincra', label: 'Fincra', note: 'Accounts, payouts and cards through Fincra are planned; not connected yet.', available: async () => false }]

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
  { key: 'capex', label: 'Equipment and capex', dir: 'out' }, { key: 'transfer', label: 'Transfer between own accounts', dir: 'any' }]
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
export async function addToLedger(source: Rail['key'], txns: RailTxn[], entityId: string | null): Promise<number> {
  const org = await currentOrg(), base = ((org?.settings.reporting_currency as string) || (org?.settings.currency as string) || 'USD')
  const rules = new Map((await db().query<{ vendor_key: string; category: string }>('SELECT vendor_key, category FROM banking.category_rules')).rows.map((r) => [r.vendor_key, r.category]))
  const rate = new Map<string, number | null>(), fx = async (a: string, b: string) => { if (a === b) return 1; const k = a + b; if (!rate.has(k)) rate.set(k, await fxRate(a, b)); return rate.get(k) ?? null }
  let n = 0
  for (const t of txns) {
    if (!t.amount) continue
    const dir = t.amount < 0 ? 'out' : 'in', amt = Math.abs(t.amount), v = vendorKey(t.description, t.vendor)
    const rule = rules.get(v.key), cat = rule ?? autoCategory(v.key, t.description, dir, t.bank_category ?? null)
    const kb = await fx(t.currency, base), ku = await fx(t.currency, 'USD')
    const r = await db().query(`INSERT INTO banking.ledger (entity_id, source, source_ref, account_label, txn_date, description, vendor_key, vendor, direction, amount, currency, amount_base, base_currency, amount_usd, category, category_by, bank_category)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) ON CONFLICT (organization_id, source, source_ref) DO NOTHING`,
      [entityId, source, t.ref.slice(0, 200), t.account.slice(0, 160), t.date, t.description.slice(0, 500), v.key, v.name, dir, amt, t.currency, Math.round(amt * (kb ?? 1) * 100) / 100, kb === null ? t.currency : base, ku === null ? null : Math.round(amt * ku * 100) / 100, cat, rule ? 'rule' : 'auto', t.bank_category ?? null])
    n += r.rowCount ?? 0
  }
  return n
}
export const uploadRef = (account: string, t: { date: string; description: string; amount: number; balance: number | null }, i: number) => createHash('sha1').update([account, t.date, t.description, t.amount, t.balance ?? '', i].join('|')).digest('hex')

// The bank feed, pulled at most every six hours (twelve months the first time).
export async function syncBankFeed(force = false): Promise<number> {
  const rail = RAILS[0]!
  if (!(await rail.available())) return 0
  const last = (await db().query<{ at: string | null; n: number }>("SELECT max(created_at)::text AS at, count(*)::int AS n FROM banking.ledger WHERE source = 'bank_feed'")).rows[0]
  if (!force && last?.at && Date.now() - new Date(last.at).getTime() < 6 * 3600_000) return 0
  const d = new Date(); d.setUTCMonth(d.getUTCMonth() - (last?.n ? 2 : 12)); d.setUTCDate(1)
  try { return await addToLedger('bank_feed', await rail.pull!(d.toISOString().slice(0, 10)), await companyEntityId()) } catch (e) { console.error('[treasury] bank feed', (e as Error).message); return 0 }
}

// Cash and burn on the same basis as Financials and the Stage Monitor, for the runway each cut gives back.
export async function cashAndBurn(cur: string): Promise<{ cash: number | null; burn: number | null; runway: number | null }> {
  const ent = await companyEntityId(); if (!ent) return { cash: null, burn: null, runway: null }
  const rows = (await loadStatements('entity:' + ent, 'month', cur)).filter((r) => r.period_type === 'month').slice(-12)
  const sec = await cashPolicy()
  const b = burnReview(rows.map((r) => ({ period_end: r.period_end, period_type: 'month', currency: r.currency, lines: r.lines, kpis: {}, derived: withSecurities(deriveLines(r.lines, 1), sec) })) as FinRow[])
  return { cash: b.cash, burn: b.burn, runway: b.runway }
}

// Tools that do the same job: two or more of them paid every month is worth a look.
const SAME_JOB: [string, RegExp][] = [['Video calls', /\b(zoom|google meet|teams|webex|whereby)\b/], ['Team chat', /\b(slack|teams|discord|chanty)\b/], ['Docs and wiki', /\b(notion|confluence|coda|clickup|google workspace)\b/],
  ['File storage', /\b(dropbox|box|google one|onedrive)\b/], ['CRM', /\b(hubspot|salesforce|pipedrive|zoho|close)\b/], ['Email sending', /\b(mailchimp|sendgrid|brevo|mailgun|postmark|resend)\b/],
  ['Design', /\b(figma|canva|adobe|sketch)\b/], ['Code hosting', /\b(github|gitlab|bitbucket)\b/], ['Cloud hosting', /\b(aws|amazon web|google cloud|azure|digitalocean|vercel|heroku|render|netlify)\b/], ['Project tracking', /\b(jira|linear|asana|trello|monday|clickup)\b/]]

export interface Vendor { key: string; name: string; category: string | null; months: Record<string, number>; total: number; monthly: number; recurring: boolean; last: string; status: string; remind_on: string | null; note: string | null }
// The spend view and the cut list, in the company's currency, from the last twelve months of the ledger.
export async function treasuryView() {
  const org = await currentOrg(), cur = ((org?.settings.reporting_currency as string) || (org?.settings.currency as string) || 'USD')
  const rows = (await db().query<{ m: string; vendor_key: string; vendor: string; direction: string; category: string | null; amt: string; last: string }>(
    `SELECT to_char(txn_date, 'YYYY-MM') AS m, vendor_key, max(vendor) AS vendor, direction, category, sum(amount_base)::text AS amt, max(txn_date)::text AS last FROM banking.ledger
     WHERE txn_date >= date_trunc('month', now()) - interval '12 months' AND coalesce(category, '') <> 'transfer' GROUP BY 1, 2, 4, 5`)).rows
  const thisM = new Date().toISOString().slice(0, 7), full = [...new Set(rows.map((r) => r.m))].filter((m) => m < thisM).sort()
  const last3 = full.slice(-3), lastM = full[full.length - 1] ?? null, prevM = full[full.length - 2] ?? null
  const months: Record<string, { in: number; out: number }> = {}, cats: Record<string, Record<string, number>> = {}
  const vend = new Map<string, Vendor>()
  for (const r of rows) {
    const a = Number(r.amt); (months[r.m] ??= { in: 0, out: 0 })[r.direction as 'in' | 'out'] += a
    if (r.direction !== 'out') continue
    const c = r.category ?? 'opex_other'; (cats[c] ??= {})[r.m] = (cats[c]![r.m] ?? 0) + a
    const v = vend.get(r.vendor_key) ?? { key: r.vendor_key, name: r.vendor, category: c, months: {}, total: 0, monthly: 0, recurring: false, last: r.last, status: 'keep', remind_on: null, note: null }
    v.months[r.m] = (v.months[r.m] ?? 0) + a; v.total += a; if (r.last > v.last) v.last = r.last; vend.set(r.vendor_key, v)
  }
  const st = new Map((await db().query<{ vendor_key: string; status: string; remind_on: string | null; note: string | null }>("SELECT vendor_key, status, to_char(remind_on, 'YYYY-MM-DD') AS remind_on, note FROM banking.vendors")).rows.map((r) => [r.vendor_key, r]))
  const med = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)]! : 0 }
  // Recurring: paid in at least three of the last four full months (or every one of them when there are fewer).
  const last4 = full.slice(-4)
  for (const v of vend.values()) {
    const paid = last4.filter((m) => (v.months[m] ?? 0) > 0)
    v.recurring = last4.length >= 2 && paid.length >= Math.min(3, last4.length) && (v.months[thisM] !== undefined || paid.includes(lastM ?? ''))
    v.monthly = Math.round(med(last3.map((m) => v.months[m] ?? 0).filter((x) => x > 0)) * 100) / 100
    const s = st.get(v.key); if (s) { v.status = s.status; v.remind_on = s.remind_on; v.note = s.note }
  }
  const cb = await cashAndBurn(cur)
  // Bank burn when Financials has none: money out less money in, over the last three full months.
  const bankBurn = last3.length ? Math.max(0, last3.reduce((s, m) => s + (months[m]!.out - months[m]!.in), 0) / last3.length) : null
  const burn = cb.burn ?? bankBurn, cash = cb.cash
  const runway = (b: number | null) => (cash === null || b === null ? null : b <= 0 ? null : Math.round(cash / b * 10) / 10)
  const now = runway(burn)
  // Taxes, loan payments and transfers are not choices to cut.
  const recurring = [...vend.values()].filter((v) => v.recurring && v.monthly > 0 && !['tax', 'interest', 'transfer', 'financing'].includes(v.category ?? '')).sort((a, b) => b.monthly - a.monthly)
  const cut = recurring.filter((v) => v.status !== 'cancelled').map((v) => { const after = burn === null ? null : burn - v.monthly; return { ...v, runway_gain: now === null || after === null ? null : after <= 0 ? 'stops the burn' : Math.round((runway(after)! - now) * 10) / 10 } })
    .sort((a, b) => (typeof b.runway_gain === 'number' ? b.runway_gain : 999) - (typeof a.runway_gain === 'number' ? a.runway_gain : 999)).slice(0, 40)
  const marked = recurring.filter((v) => v.status === 'to_cancel').reduce((s, v) => s + v.monthly, 0)
  const dupes = SAME_JOB.map(([job, re]) => ({ job, vendors: recurring.filter((v) => re.test(v.key + ' ' + v.name.toLowerCase())).map((v) => ({ name: v.name, monthly: v.monthly })) })).filter((g) => g.vendors.length > 1)
  const budgets = new Map((await db().query<{ category: string; monthly: string }>('SELECT category, monthly FROM banking.budgets')).rows.map((r) => [r.category, Number(r.monthly)]))
  const accts = (await listAccounts().catch(() => [])).map((a) => ({ key: 'cat:' + a.parent + ':' + a.name, label: a.name, parent: a.parent }))
  const catLabel = (k: string) => STD_CATS.find((c) => c.key === k)?.label ?? accts.find((a) => a.key === k)?.label ?? k
  const byCat = Object.entries(cats).map(([k, ms]) => ({ key: k, label: catLabel(k), last: lastM ? ms[lastM] ?? 0 : 0, prev: prevM ? ms[prevM] ?? 0 : 0, avg3: last3.reduce((s, m) => s + (ms[m] ?? 0), 0) / Math.max(1, last3.length), budget: budgets.get(k) ?? null })).sort((a, b) => b.avg3 - a.avg3)
  const topVendors = [...vend.values()].map((v) => ({ key: v.key, name: v.name, category: catLabel(v.category ?? 'opex_other'), last: lastM ? v.months[lastM] ?? 0 : 0, prev: prevM ? v.months[prevM] ?? 0 : 0, total: v.total, recurring: v.recurring })).sort((a, b) => b.total - a.total).slice(0, 15)
  const movers = [...vend.values()].map((v) => ({ name: v.name, last: lastM ? v.months[lastM] ?? 0 : 0, prev: prevM ? v.months[prevM] ?? 0 : 0 })).map((x) => ({ ...x, change: x.last - x.prev })).filter((x) => Math.abs(x.change) > 0).sort((a, b) => Math.abs(b.change) - Math.abs(a.change)).slice(0, 8)
  const count = (await db().query<{ n: number; first: string | null; sources: string[] }>("SELECT count(*)::int AS n, min(txn_date)::text AS first, array_agg(DISTINCT source) AS sources FROM banking.ledger")).rows[0]!
  return { currency: cur, months: full.map((m) => ({ month: m, ...months[m]! })), last_month: lastM, prev_month: prevM,
    cash, burn, runway: now, marked_monthly: Math.round(marked * 100) / 100, runway_if_cut: marked && burn !== null ? (burn - marked <= 0 ? 'no longer burning' : runway(burn - marked)) : null,
    by_category: byCat, top_vendors: topVendors, movers, recurring_total: Math.round(recurring.reduce((s, v) => s + v.monthly, 0) * 100) / 100, cut_list: cut, duplicates: dupes,
    categories: [...STD_CATS.map((c) => ({ key: c.key, label: c.label })), ...accts.map((a) => ({ key: a.key, label: a.label + ' (' + (STD_CATS.find((c) => c.key === a.parent)?.label ?? a.parent) + ')' }))],
    ledger: { count: count.n, since: count.first, sources: count.sources ?? [] } }
}
