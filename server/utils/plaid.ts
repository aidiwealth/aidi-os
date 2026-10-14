// Plaid: link tokens, token exchange and balances. Sandbox or production from NUXT_PLAID_ENV.
export function plaidOn(): boolean { const c = useRuntimeConfig(); return !!(c.plaidClientId && c.plaidSecret) }
export async function plaid<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const c = useRuntimeConfig()
  if (!plaidOn()) throw apiError('plaid_off', 'Bank connections are not set up yet.', 503)
  const env = (c.plaidEnv as string) === 'production' ? 'production' : 'sandbox'
  const r = await fetch('https://' + env + '.plaid.com' + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_id: c.plaidClientId, secret: c.plaidSecret, ...body }), signal: AbortSignal.timeout(20000) })
  const j = await r.json() as T & { error_message?: string; error_code?: string }
  if (!r.ok) { console.error('[plaid]', path, j.error_code, j.error_message); throw apiError('plaid', 'The bank connection returned an error: ' + (j.error_message ?? r.status), 502) }
  return j
}
interface PAcct { account_id: string; name: string; official_name?: string; mask?: string; type?: string; subtype?: string; balances: { current: number | null; available: number | null; iso_currency_code: string | null; unofficial_currency_code: string | null } }
export async function refreshItem(itemRowId: string, accessTokenEnc: string): Promise<void> {
  try {
    const j = await plaid<{ accounts: PAcct[] }>('/accounts/balance/get', { access_token: decryptText(accessTokenEnc) })
    for (const a of j.accounts) await db().query(`INSERT INTO banking.plaid_accounts (item_id, account_id, name, mask, type, subtype, currency, current, available, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
      ON CONFLICT (account_id) DO UPDATE SET name = EXCLUDED.name, current = EXCLUDED.current, available = EXCLUDED.available, currency = EXCLUDED.currency, updated_at = now()`,
      [itemRowId, a.account_id, (a.official_name || a.name).slice(0, 200), a.mask ?? null, a.type ?? null, a.subtype ?? null, a.balances.iso_currency_code || a.balances.unofficial_currency_code || 'USD', a.balances.current, a.balances.available])
    await db().query('UPDATE banking.plaid_items SET error = NULL WHERE id = $1', [itemRowId])
  } catch (err) { await db().query('UPDATE banking.plaid_items SET error = $2 WHERE id = $1', [itemRowId, String((err as Error).message).slice(0, 300)]) }
}

// Money in and out by month (and the biggest kinds of spending) from an item's transactions over the last four full
// months and this month so far. Cards and loans are left out; pending transactions too. Kept for six hours.
export interface BankFlows { months: Record<string, Record<string, { in: number; out: number }>>; spend: Record<string, Record<string, number>>; from: string; to: string }
interface PTxn { account_id: string; amount: number; date: string; pending: boolean; iso_currency_code: string | null; unofficial_currency_code: string | null; personal_finance_category?: { primary?: string } | null }
export async function itemFlows(itemRowId: string, accessTokenEnc: string, force = false): Promise<BankFlows | null> {
  const cur = (await db().query<{ flows: BankFlows | null; fresh: boolean }>("SELECT flows, coalesce(flows_at > now() - interval '6 hours', false) AS fresh FROM banking.plaid_items WHERE id = $1", [itemRowId])).rows[0]
  if (cur?.flows && cur.fresh && !force) return cur.flows
  if (!plaidOn()) return cur?.flows ?? null
  const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 4)
  const from = d.toISOString().slice(0, 10), to = new Date().toISOString().slice(0, 10)
  try {
    const skip = new Set((await db().query<{ account_id: string }>("SELECT account_id FROM banking.plaid_accounts WHERE item_id = $1 AND (type IN ('credit', 'loan') OR subtype IN ('credit card', 'loan'))", [itemRowId])).rows.map((r) => r.account_id))
    const txns: PTxn[] = []
    for (let off = 0; off < 3000; off += 500) {
      const j = await plaid<{ transactions: PTxn[]; total_transactions: number }>('/transactions/get', { access_token: decryptText(accessTokenEnc), start_date: from, end_date: to, options: { count: 500, offset: off } })
      txns.push(...j.transactions); if (txns.length >= j.total_transactions || !j.transactions.length) break
    }
    const f: BankFlows = { months: {}, spend: {}, from, to }
    for (const t of txns) {
      if (t.pending || skip.has(t.account_id)) continue
      const c = t.iso_currency_code || t.unofficial_currency_code || 'USD', m = t.date.slice(0, 7)
      const mm = ((f.months[c] ??= {})[m] ??= { in: 0, out: 0 })
      // The bank reports money out as a positive amount.
      if (t.amount < 0) mm.in += -t.amount; else { mm.out += t.amount; const k = t.personal_finance_category?.primary ?? 'OTHER'; (f.spend[c] ??= {})[k] = ((f.spend[c] ??= {})[k] ?? 0) + t.amount }
    }
    await db().query('UPDATE banking.plaid_items SET flows = $2, flows_at = now() WHERE id = $1', [itemRowId, JSON.stringify(f)])
    return f
  } catch (err) { console.error('[bank] flows', (err as Error).message); return cur?.flows ?? null }
}
const SPEND_LABEL: Record<string, string> = { GENERAL_SERVICES: 'Services', GENERAL_MERCHANDISE: 'Purchases', RENT_AND_UTILITIES: 'Rent and utilities', TRANSFER_OUT: 'Transfers out', LOAN_PAYMENTS: 'Loan payments', BANK_FEES: 'Bank fees', TRAVEL: 'Travel', FOOD_AND_DRINK: 'Food and drink', TRANSPORTATION: 'Transport', GOVERNMENT_AND_NON_PROFIT: 'Taxes and government', ENTERTAINMENT: 'Entertainment', HOME_IMPROVEMENT: 'Office and equipment', MEDICAL: 'Medical', PERSONAL_CARE: 'Personal care', OTHER: 'Other' }
// The company's connected banks, as one picture in the reporting currency: cash now, and money in and out by month.
export async function bankSnapshot(to: string) {
  const items = (await db().query<{ id: string; access_token_enc: string; institution: string | null; error: string | null }>('SELECT id, access_token_enc, institution, error FROM banking.plaid_items WHERE wm_client_id IS NULL ORDER BY created_at')).rows
  if (!items.length) return { connected: false, enabled: plaidOn(), accounts: [], cash: 0, as_of: null as string | null, months: [] as { month: string; in: number; out: number; net: number }[], spend: [] as { label: string; amount: number }[], avg_in: 0, avg_out: 0, burn: 0, full_months: 0 }
  for (const it of items) { const old = (await db().query("SELECT 1 FROM banking.plaid_accounts WHERE item_id = $1 AND updated_at > now() - interval '1 hour' LIMIT 1", [it.id])).rowCount; if (!old && plaidOn()) await refreshItem(it.id, it.access_token_enc) }
  const accts = (await db().query<{ item_id: string; name: string; mask: string | null; type: string | null; subtype: string | null; currency: string; current: string | null; updated_at: string }>('SELECT item_id, name, mask, type, subtype, currency, current::text, updated_at FROM banking.plaid_accounts WHERE item_id = ANY($1::uuid[]) ORDER BY name', [items.map((i) => i.id)])).rows
  const rate = async (c: string) => (c === to ? 1 : (await fxRate(c, to)) ?? 0)
  let cash = 0
  const accounts = []
  for (const a of accts) { const debt = ['credit', 'loan'].includes(a.type ?? '') || ['credit card', 'loan'].includes(a.subtype ?? ''); const v = Number(a.current ?? 0) * (await rate(a.currency)); if (!debt) cash += v
    accounts.push({ institution: items.find((i) => i.id === a.item_id)?.institution ?? 'Bank', name: a.name, mask: a.mask, currency: a.currency, balance: a.current === null ? null : Number(a.current), debt, updated_at: a.updated_at }) }
  const months: Record<string, { in: number; out: number }> = {}, spend: Record<string, number> = {}
  for (const it of items) {
    const f = await itemFlows(it.id, it.access_token_enc); if (!f) continue
    for (const [c, ms] of Object.entries(f.months)) { const k = await rate(c); for (const [m, v] of Object.entries(ms)) { const x = (months[m] ??= { in: 0, out: 0 }); x.in += v.in * k; x.out += v.out * k } }
    for (const [c, sp] of Object.entries(f.spend)) { const k = await rate(c); for (const [cat, v] of Object.entries(sp)) spend[SPEND_LABEL[cat] ?? 'Other'] = (spend[SPEND_LABEL[cat] ?? 'Other'] ?? 0) + v * k }
  }
  const thisMonth = new Date().toISOString().slice(0, 7)
  const full = Object.keys(months).filter((m) => m < thisMonth).sort().slice(-3)
  const r = (v: number) => Math.round(v * 100) / 100
  const avg_in = full.length ? r(full.reduce((s, m) => s + months[m]!.in, 0) / full.length) : 0, avg_out = full.length ? r(full.reduce((s, m) => s + months[m]!.out, 0) / full.length) : 0
  const totalSpend = Object.values(spend).reduce((s, v) => s + v, 0)
  return { connected: true, enabled: plaidOn(), accounts, cash: r(cash), as_of: accts.map((a) => a.updated_at).sort()[0] ?? null,
    months: Object.keys(months).sort().map((m) => ({ month: m, in: r(months[m]!.in), out: r(months[m]!.out), net: r(months[m]!.in - months[m]!.out), partial: m === thisMonth })),
    spend: Object.entries(spend).map(([label, amount]) => ({ label, amount: r(amount), pct: totalSpend ? Math.round(amount / totalSpend * 100) : 0 })).sort((a, b) => b.amount - a.amount).slice(0, 6),
    avg_in, avg_out, burn: r(Math.max(0, avg_out - avg_in)), full_months: full.length }
}
