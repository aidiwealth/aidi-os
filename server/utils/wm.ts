// Aidi Wealth inside Aidi OS: settings per country, client summaries, fee schedules, KYC providers.
import { randomBytes } from 'node:crypto'
export interface WmCountry { managed: boolean; advisor: boolean; self_directed: boolean; savings: boolean; alpaca: boolean; busha: boolean; anchor: boolean; plaid: boolean; savings_provider: string; savings_vendor: string; savings_rate: number; subscription: number; currency: string }
export interface WmConfig { US: WmCountry; NG: WmCountry; advisory_tiers: { upto: number | null; pct: number }[]; gold_usd_oz: number | null; silver_usd_oz: number | null; spot_as_of: string | null }
export async function wmSettings(): Promise<WmConfig> {
  const s = (((await currentOrg())?.settings ?? {}) as Record<string, unknown>).wm_config as Partial<WmConfig> | undefined
  const d = wmDefaults()
  return { ...d, ...(s ?? {}), US: { ...d.US, ...(s?.US ?? {}) }, NG: { ...d.NG, ...(s?.NG ?? {}) }, advisory_tiers: s?.advisory_tiers?.length ? s.advisory_tiers : d.advisory_tiers }
}
// Tiered advisory fee: each slice of assets is charged at its tier's rate (1% stepping down to 0.5%).
export function advisoryFee(aumUsd: number, tiers: { upto: number | null; pct: number }[]): number {
  let left = aumUsd, prev = 0, fee = 0
  for (const t of tiers) { const cap = t.upto == null ? Infinity : t.upto; const slice = Math.max(0, Math.min(left, cap - prev)); fee += slice * t.pct / 100; left -= slice; prev = cap; if (left <= 0) break }
  return Math.round(fee * 100) / 100
}
export const wmEntityFor = async (country: 'US' | 'NG') => (await db().query<{ id: string }>("SELECT id FROM core.entities WHERE regexp_replace(lower(name), '[^a-z0-9]', '', 'g') = $1 LIMIT 1", [country === 'US' ? 'aidiwealthllc' : 'aidifinancelimited'])).rows[0]?.id ?? null
export const newToken = () => randomBytes(24).toString('base64url')
export async function wmClientOfUser(userId: string): Promise<string | null> { return (await db().query<{ id: string }>('SELECT id FROM wm.clients WHERE user_id = $1 LIMIT 1', [userId])).rows[0]?.id ?? null }
const CLASS: Record<string, string> = { public_securities: 'Stocks & ETFs', crypto: 'Crypto', precious_metals: 'Gold & metals', bonds: 'Bonds & fixed income', cash: 'Cash & savings', real_estate: 'Real estate', fund: 'Funds', retirement: 'Retirement', private_stake: 'Private', venture: 'Private', other: 'Other', liability: 'Liabilities' }
// Everything a client holds, in USD: holdings, external accounts and linked bank balances.
export async function clientSummary(clientId: string) {
  const usd = async (v: number, c: string) => (c === 'USD' ? v : v * ((await fxRate(c, 'USD')) ?? 0))
  const holdings = (await db().query<{ id: string; category: string; name: string; platform: string | null; currency: string; cost: string | null; current_value: string | null; as_of: string | null; meta: Record<string, unknown>; status: string; notes: string | null }>(
    "SELECT id, category, name, platform, currency, cost::text, current_value::text, to_char(as_of, 'YYYY-MM-DD') AS as_of, meta, status, notes FROM wealth.holdings WHERE wm_client_id = $1 AND status NOT IN ('sold','written_off') ORDER BY category, name", [clientId])).rows
  const accounts = (await db().query<{ id: string; provider: string; institution: string; kind: string; name: string | null; currency: string; balance: string; cash_part: string | null; as_of: string; managed_by: string | null }>(
    "SELECT id, provider, institution, kind, name, currency, balance::text, cash_part::text, to_char(as_of, 'YYYY-MM-DD') AS as_of, managed_by FROM wm.accounts WHERE client_id = $1 ORDER BY institution", [clientId])).rows
  const banks = (await db().query<{ id: string; name: string; mask: string | null; subtype: string | null; currency: string; current: string | null; institution: string | null; updated_at: string }>(
    "SELECT a.id, a.name, a.mask, a.subtype, a.currency, a.current::text, i.institution, a.updated_at FROM banking.plaid_accounts a JOIN banking.plaid_items i ON i.id = a.item_id WHERE i.wm_client_id = $1 ORDER BY i.institution, a.name", [clientId])).rows
  let invested = 0, cost = 0, cash = 0; const byClass: Record<string, number> = {}; const byPlatform: Record<string, number> = {}
  for (const h of holdings) { const v = await usd(Number(h.current_value ?? h.cost ?? 0), h.currency); const c = await usd(Number(h.cost ?? 0), h.currency); const k = CLASS[h.category] ?? 'Other'; if (h.category === 'liability') { byClass[k] = (byClass[k] ?? 0) - v; continue } if (h.category === 'cash') cash += v; else { invested += v; cost += c } byClass[k] = (byClass[k] ?? 0) + v; const pl = h.platform || 'Held directly'; byPlatform[pl] = (byPlatform[pl] ?? 0) + v }
  for (const a of accounts) { const v = await usd(Number(a.balance), a.currency); if (a.kind === 'bank' || a.kind === 'savings') { cash += v; byClass['Cash & savings'] = (byClass['Cash & savings'] ?? 0) + v } else { invested += v; byClass[a.kind === 'crypto' ? 'Crypto' : 'Stocks & ETFs'] = (byClass[a.kind === 'crypto' ? 'Crypto' : 'Stocks & ETFs'] ?? 0) + v } byPlatform[a.institution] = (byPlatform[a.institution] ?? 0) + v }
  for (const b of banks) if (b.current != null && !['credit', 'loan'].includes(b.subtype ?? '')) { const v = await usd(Number(b.current), b.currency); cash += v; byPlatform[b.institution ?? 'Bank'] = (byPlatform[b.institution ?? 'Bank'] ?? 0) + v }
  const liabilities = -(byClass['Liabilities'] ?? 0)
  const r = (x: number) => Math.round(x * 100) / 100
  return { holdings, accounts, banks, totals: { net_worth: r(invested + cash - liabilities), invested: r(invested), cash: r(cash), cost: r(cost), gain: r(invested - cost), liabilities: r(liabilities) },
    by_class: Object.entries(byClass).filter(([k]) => k !== 'Liabilities').map(([label, value]) => ({ label, value: r(value) })).filter((x) => x.value > 0),
    by_platform: Object.entries(byPlatform).map(([label, value]) => ({ label, value: r(value) })).sort((a, b) => b.value - a.value) }
}
// Prembly IdentityPass (Nigeria): BVN validation.
export async function premblyBvn(bvn: string): Promise<{ ok: boolean; data: Record<string, unknown>; detail: string }> {
  const c = useRuntimeConfig() as unknown as Record<string, string>
  if (!c.premblyApiKey || !c.premblyAppId) throw apiError('prembly_off', 'Prembly is not set up (NUXT_PREMBLY_API_KEY and NUXT_PREMBLY_APP_ID).', 503)
  const res = await fetch((c.premblyBaseUrl || 'https://api.prembly.com') + '/identitypass/verification/bvn_validation', { method: 'POST', headers: { 'x-api-key': c.premblyApiKey, 'app-id': c.premblyAppId, 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ number: bvn }) })
  const j = await res.json().catch(() => ({})) as { status?: boolean; detail?: string; data?: Record<string, unknown> }
  return { ok: res.ok && j.status === true, data: j.data ?? {}, detail: j.detail ?? ('HTTP ' + res.status) }
}
// Post a received fee to the books of the wealth entity (Aidi Wealth LLC for US, Aidi Finance Limited for Nigeria).
export async function bookFee(feeId: string) {
  const f = (await db().query<{ kind: string; amount: string; currency: string; paid_on: string; entity_id: string | null; who: string | null; period: string | null }>(
    "SELECT f.kind, f.amount::text, f.currency, to_char(coalesce(f.paid_on, current_date), 'YYYY-MM-DD') AS paid_on, coalesce(f.entity_id, c.entity_id) AS entity_id, coalesce(c.name, fm.name) AS who, f.period FROM wm.fees f LEFT JOIN wm.clients c ON c.id = f.client_id LEFT JOIN wm.firms fm ON fm.id = f.firm_id WHERE f.id = $1", [feeId])).rows[0]
  if (!f) return
  await db().query('DELETE FROM finance.journal WHERE wm_fee_id = $1', [feeId])
  const acct = f.kind === 'advisory' ? 'Revenue: Advisory fees' : f.kind === 'subscription' ? 'Revenue: Subscription fees' : 'Revenue: Referral fees'
  const memo = acct.replace('Revenue: ', '') + ' · ' + (f.who ?? '') + (f.period ? ' · ' + f.period : '')
  await db().query("INSERT INTO finance.journal (entity_id, entry_date, account, debit, credit, currency, memo, wm_fee_id) VALUES ($1,$2,'Cash at bank',$3,0,$4,$5,$6), ($1,$2,$7,0,$3,$4,$5,$6)", [f.entity_id, f.paid_on, f.amount, f.currency, memo, feeId, acct])
}
