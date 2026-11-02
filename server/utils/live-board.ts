import { useEvent } from 'nitropack/runtime'
import { deriveLines } from '~/shared/fin-view'
// The group live board: the few numbers that matter, live. Called in the workspace's own context (row-level security
// keeps it to that workspace and, for a scoped person, to their entities).
//  - Net worth: everything in NAV less liabilities, with gold and silver re-priced from the live spot price (ounces held)
//    and stocks, ETFs and crypto from the latest quote (units held), so it moves with the market; today's change is
//    what those prices did today. Values in other currencies are converted at the book rate.
//  - Revenue and profit this year: every operating entity's monthly books, January to now, against the same months
//    last year (sales between group companies taken out).
//  - Cash: connected bank balances (live) plus each other account's latest statement.
//  - Net worth over 12 months: each holding at each month end — gold and silver at that day's price, stocks at that
//    day's close, others at their valuation then (before the first one: cost, else today's value).
// Prices refresh every 30 seconds; holdings and cash every 30 seconds; the books and the 12 months every 5 minutes.
export const LB_NUMBERS: Record<string, string> = { net_worth: 'Group net worth', revenue: 'Revenue this year', profit: 'Profit this year', cash: 'Cash', client_assets: 'Client assets', venture: 'Portfolio allocation', gold: 'Gold and silver', stocks: 'Stocks and ETFs', occupancy: 'Aidi Haven occupancy', tasks: 'Tasks done this week', finvry: 'New Finvry companies' }
export const LB_PANELS: Record<string, string> = { mix: 'Where the wealth is', trend: 'Net worth · 12 months', revenue_by: 'Revenue by business', revenue_mix: 'Revenue by company', week: 'This week' }
export interface LbLayout { numbers: { key: string; on: boolean }[]; panels: { key: string; on: boolean }[]; ticker: boolean }
export const LB_DEFAULT: LbLayout = {
  numbers: Object.keys(LB_NUMBERS).map((key, i) => ({ key, on: i < 5 })),
  panels: Object.keys(LB_PANELS).map((key) => ({ key, on: key !== 'week' })), ticker: true }
// A saved layout, with any number or panel added since filled in (off) and unknown ones dropped.
export function lbLayout(v: unknown): LbLayout {
  const l = (v && typeof v === 'object' ? v : {}) as Partial<LbLayout>
  const fix = (saved: { key: string; on: boolean }[] | undefined, all: Record<string, string>, def: { key: string; on: boolean }[]) => {
    const s = (Array.isArray(saved) ? saved : []).filter((x) => x && all[x.key]).map((x) => ({ key: x.key, on: !!x.on }))
    if (!s.length) return def
    // Added since the layout was saved: shown or hidden as by default.
    for (const d of def) if (!s.some((x) => x.key === d.key)) s.push({ key: d.key, on: d.on })
    return s
  }
  return { numbers: fix(l.numbers, LB_NUMBERS, LB_DEFAULT.numbers), panels: fix(l.panels, LB_PANELS, LB_DEFAULT.panels), ticker: l.ticker !== false }
}

const MIX: Record<string, [string, string]> = { venture: ['venture', 'Venture & private'], private_stake: ['venture', 'Venture & private'], fund: ['venture', 'Venture & private'], secondaries: ['venture', 'Venture & private'], public_securities: ['stocks', 'Stocks & ETFs'], retirement: ['stocks', 'Stocks & ETFs'],
  real_estate: ['real_estate', 'Real estate'], precious_metals: ['metals', 'Gold & silver'], bonds: ['bonds', 'T-bills & bonds'], cash: ['cash', 'Cash'], crypto: ['crypto', 'Crypto'], other: ['other', 'Other'] }
const short = (n: string) => n.replace(/,?\s+(LLC|L\.L\.C\.|Ltd\.?|Limited|Inc\.?|Corp\.?|PLC)$/i, '')
const memo = new Map<string, { at: number; v: unknown }>()
async function cached<T>(key: string, ttl: number, fn: () => Promise<T>): Promise<T> {
  const c = memo.get(key); if (c && Date.now() - c.at < ttl) return c.v as T
  const v = await fn(); memo.set(key, { at: Date.now(), v }); return v
}
const r0 = (v: number) => Math.round(v)
type H = { id: string; section: string; category: string; currency: string; cost: string | null; current_value: string | null; in_nav: boolean; status: string; meta: Record<string, unknown> }

async function holdings(): Promise<H[]> {
  return (await db().query<H>(`SELECT h.id, h.section, h.category, h.currency, h.cost::text, h.current_value::text, h.in_nav, h.status, h.meta
    FROM wealth.holdings h WHERE h.status NOT IN ('sold', 'written_off', 'nil')`)).rows
}
const metalOf = (h: H) => (h.category === 'precious_metals' && Number(h.meta?.ounces) > 0 ? (String(h.meta?.metal ?? 'gold').toLowerCase().startsWith('s') ? 'XAG' : 'XAU') : null)
const qtyOf = (h: H) => Number(h.meta?.qty ?? h.meta?.units ?? 0)
const symOf = (h: H) => (typeof h.meta?.symbol === 'string' && h.meta.symbol && qtyOf(h) > 0 && ['public_securities', 'crypto', 'retirement', 'fund'].includes(h.category) ? String(h.meta.symbol).toUpperCase() : null)

// Everything that moves with prices, and the totals, now.
async function livePart() {
  const hs = await holdings()
  const book = await rateBook(); const month = new Date().toISOString().slice(0, 7)
  const usd = (v: number, cur: string) => (cur === 'USD' ? v : v * (book.convert(cur, 'USD', month)?.rate ?? 0))
  const metals = await metalPrices().catch(() => ({ gold: null, silver: null }))
  const spot: Record<string, { price: number; prev: number | null } | null> = {
    XAU: metals.gold ? { price: metals.gold.price, prev: metals.gold.day_change_pct != null ? metals.gold.price / (1 + metals.gold.day_change_pct / 100) : null } : null,
    XAG: metals.silver ? { price: metals.silver.price, prev: metals.silver.day_change_pct != null ? metals.silver.price / (1 + metals.silver.day_change_pct / 100) : null } : null }
  const syms = [...new Set(hs.map(symOf).filter((s): s is string => !!s))]
  const kinds = new Map(hs.filter((h) => symOf(h)).map((h) => [symOf(h)!, h.category === 'crypto' ? 'crypto' as const : 'stock' as const]))
  const q = syms.length ? await quoteMany(syms.map((s) => ({ symbol: s, kind: kinds.get(s)! }))).catch(() => new Map()) : new Map()
  let assets = 0, liab = 0, today = 0, gold = 0, goldOz = 0, goldDay = 0, stocks = 0, stocksDay = 0, venture = 0, clients = 0, ventureCost = 0, ventureN = 0
  const mix: Record<string, { label: string; value: number }> = {}
  for (const h of hs) {
    let v = usd(Number(h.current_value ?? h.cost ?? 0), h.currency), d = 0
    const m = metalOf(h), s = symOf(h)
    if (m && spot[m]) { const oz = Number(h.meta.ounces); v = oz * spot[m]!.price; d = spot[m]!.prev ? oz * (spot[m]!.price - spot[m]!.prev!) : 0 }
    else if (s && q.get(s)) { const x = q.get(s)!; v = qtyOf(h) * x.price; d = x.prev_close ? qtyOf(h) * (x.price - x.prev_close) : 0 }
    if (h.section === 'client') { clients += v; continue }
    if (!h.in_nav) continue
    if (h.category === 'liability') { liab += Math.abs(v); continue }
    assets += v; today += d
    if (h.category === 'precious_metals') { gold += v; goldDay += d; goldOz += Number(h.meta?.ounces ?? 0) }
    if (['public_securities', 'retirement', 'fund'].includes(h.category) && s) { stocks += v; stocksDay += d }
    // Our allocation in portfolio companies: what we put in (cost), and what that stake is worth now.
    if (['venture', 'private_stake', 'secondaries'].includes(h.category)) { venture += v; ventureCost += usd(Number(h.cost ?? 0), h.currency); ventureN++ }
    const [k, label] = MIX[h.category] ?? ['other', 'Other']; mix[k] = { label, value: (mix[k]?.value ?? 0) + v }
  }
  // Cash: connected banks (live balances) and the latest statement of every other account.
  const plaid = (await db().query<{ currency: string; v: string }>("SELECT currency, sum(current)::text AS v FROM banking.plaid_accounts WHERE coalesce(type, 'depository') = 'depository' GROUP BY currency").catch(() => ({ rows: [] }))).rows
  const stmts = (await db().query<{ currency: string; v: string }>(`SELECT a.currency, sum(s.closing_balance)::text AS v FROM banking.accounts a
      JOIN LATERAL (SELECT closing_balance FROM banking.statements WHERE account_id = a.id ORDER BY period_end DESC LIMIT 1) s ON true WHERE a.active AND a.plaid_account_id IS NULL GROUP BY a.currency`).catch(() => ({ rows: [] }))).rows
  const cash = [...plaid, ...stmts].reduce((t, r) => t + usd(Number(r.v ?? 0), r.currency), 0)
  const accounts = Number((await db().query<{ n: number }>("SELECT ((SELECT count(*) FROM banking.plaid_accounts WHERE coalesce(type, 'depository') = 'depository') + (SELECT count(*) FROM banking.accounts WHERE active AND plaid_account_id IS NULL))::int AS n").catch(() => ({ rows: [{ n: 0 }] }))).rows[0]?.n ?? 0)
  const nav = assets - liab
  return { nav: r0(nav), today: r0(today), today_pct: nav - today ? Math.round((today / (nav - today)) * 10000) / 100 : 0, cash: r0(cash), accounts, client_assets: r0(clients), venture: r0(venture), venture_cost: r0(ventureCost), venture_count: ventureN,
    gold: { value: r0(gold), oz: Math.round(goldOz * 100) / 100, today: r0(goldDay) }, stocks: { value: r0(stocks), today: r0(stocksDay) },
    mix: Object.entries(mix).filter(([, x]) => x.value > 0).map(([key, x]) => ({ key, label: x.label, value: r0(x.value) })).sort((a, b) => b.value - a.value) }
}

// The books: revenue and profit this year by operating entity, against the same months last year.
async function booksPart() {
  const ents = (await db().query<{ id: string; name: string; currency: string | null }>("SELECT id, name, currency FROM core.entities WHERE kind = 'operating' AND status <> 'closed' ORDER BY created_at")).rows
  const book = await rateBook(); const now = new Date(), y = now.getUTCFullYear(), cm = now.toISOString().slice(0, 7)
  const tagged = new Set((await db().query<{ name: string }>('SELECT lower(name) AS name FROM financials.accounts WHERE intercompany').catch(() => ({ rows: [] as { name: string }[] }))).rows.map((x) => x.name))
  const icRev = (det: Record<string, number> | undefined) => Object.entries(det ?? {}).reduce((s, [k, v]) => { const i = k.indexOf('|'); return k.slice(0, i) === 'revenue' && typeof v === 'number' && isIntercompany(k.slice(i + 1), tagged) ? s + v : s }, 0)
  let rev = 0, prof = 0, revLy = 0, profLy = 0, ic = 0, latest = ''
  const by: { name: string; revenue: number }[] = []
  for (const e of ents) {
    const rows = (await loadStatements('entity:' + e.id, 'month', 'USD', { raw: true }).catch(() => [])).filter((r) => Object.keys(r.lines).length)
    let er = 0
    for (const r of rows) {
      const m = r.period_end.slice(0, 7), yr = Number(m.slice(0, 4)), mo = m.slice(5)
      const rate = (r.currency ?? e.currency ?? 'USD') === 'USD' ? 1 : book.convert(r.currency ?? e.currency ?? 'USD', 'USD', m)?.rate ?? 0
      const d = deriveLines(r.lines, 1) as Record<string, number | null>
      const rv = (d.revenue ?? 0) * rate, ni = (d.net_income ?? 0) * rate
      if (yr === y && m <= cm) { rev += rv; prof += ni; er += rv; ic += icRev(r.detail) * rate; if (m > latest) latest = m }
      else if (yr === y - 1 && mo <= cm.slice(5)) { revLy += rv; profLy += ni }
    }
    if (er) by.push({ name: short(e.name), revenue: r0(er) })
  }
  rev -= ic
  return { revenue: r0(rev), profit: r0(prof), margin: rev ? Math.round((prof / rev) * 1000) / 10 : null, revenue_growth: revLy ? Math.round(((rev - revLy) / Math.abs(revLy)) * 1000) / 10 : null, profit_ly: r0(profLy), books_to: latest || null, by: by.sort((a, b) => b.revenue - a.revenue) }
}

// Net worth at each of the last 12 month ends.
async function trendPart() {
  const hs = (await holdings()).filter((h) => h.in_nav && h.section !== 'client')
  const ends = Array.from({ length: 12 }, (_, i) => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 12 + i + 1); d.setUTCDate(0); return d.toISOString().slice(0, 10) })
  const vals = (await db().query<{ holding_id: string; d: string; v: string }>("SELECT holding_id, to_char(as_of, 'YYYY-MM-DD') AS d, value::text AS v FROM wealth.valuations ORDER BY as_of")).rows
  const vmap = new Map<string, { d: string; v: number }[]>(); for (const x of vals) { if (!vmap.has(x.holding_id)) vmap.set(x.holding_id, []); vmap.get(x.holding_id)!.push({ d: x.d, v: Number(x.v) }) }
  const metal = async (s: string) => (await db().query<{ d: string; p: string }>("SELECT to_char(date_trunc('day', as_of), 'YYYY-MM-DD') AS d, (array_agg(price ORDER BY as_of DESC))[1]::text AS p FROM wm.market WHERE symbol = $1 AND as_of >= now() - interval '400 days' GROUP BY 1 ORDER BY 1", [s])).rows.map((r) => ({ d: r.d, v: Number(r.p) }))
  const px: Record<string, { d: string; v: number }[]> = { XAU: await metal('XAU').catch(() => []), XAG: await metal('XAG').catch(() => []) }
  const syms = [...new Set(hs.map(symOf).filter((s): s is string => !!s))]
  for (const s of syms) px[s] = (await priceSeries(s, ends[0]!.slice(0, 8) + '01').catch(() => [])).map((r) => ({ d: r.d, v: r.close }))
  const at = (list: { d: string; v: number }[] | undefined, d: string) => { if (!list?.length) return null; let v: number | null = null; for (const x of list) { if (x.d > d) break; v = x.v } return v }
  const book = await rateBook()
  return ends.map((d) => {
    let t = 0
    for (const h of hs) {
      // Held through the year unless a purchase date says otherwise (most holdings were entered later than bought).
      const bought = typeof h.meta?.purchase_date === 'string' ? h.meta.purchase_date : typeof h.meta?.acquired_on === 'string' ? h.meta.acquired_on : null
      if (bought && bought > d) continue
      const m = metalOf(h), s = symOf(h)
      let v: number | null = null
      if (m) { const p = at(px[m], d); if (p) v = Number(h.meta.ounces) * p }
      else if (s) { const p = at(px[s], d); if (p) v = qtyOf(h) * p }
      if (v === null) v = at(vmap.get(h.id), d)
      // Before its first recorded valuation: what it cost, else what it is worth now.
      if (v === null) v = vmap.get(h.id)?.length ? Number(h.cost ?? vmap.get(h.id)![0]!.v) : Number(h.current_value ?? h.cost ?? 0)
      if (h.currency !== 'USD' && !m && !s) v *= book.convert(h.currency, 'USD', d.slice(0, 7))?.rate ?? 0
      t += h.category === 'liability' ? -Math.abs(v) : v
    }
    return { d, v: r0(t) }
  })
}

async function weekPart() {
  const tasks = (await db().query<{ done: number; due: number }>("SELECT count(*) FILTER (WHERE status = 'done' AND completed_at >= date_trunc('week', now()))::int AS done, count(*) FILTER (WHERE status <> 'done' AND due_on < date_trunc('week', now())::date + 7)::int AS due FROM core.tasks").catch(() => ({ rows: [{ done: 0, due: 0 }] }))).rows[0]!
  // New Finvry companies this month (the platform's own count; Aidi's workspace is the platform owner).
  const finvry = await asPlatform(async () => Number((await db().query<{ n: number }>("SELECT count(*)::int AS n FROM core.organizations WHERE kind = 'company' AND created_at >= date_trunc('month', now())")).rows[0]?.n ?? 0)).catch(() => 0)
  let occupancy: number | null = null
  try { const f = await unitFigures(new Date().toISOString().slice(0, 7)); let n = 0, c = 0; for (const x of f.values()) { n += x.nights; c += x.days } occupancy = c ? Math.round((n / c) * 1000) / 10 : null } catch { /* no rentals */ }
  return { tasks_done: tasks.done, tasks_total: tasks.done + tasks.due, finvry_new: finvry, occupancy }
}

export async function liveBoard(orgId: string) {
  // Cached per workspace and per entity scope (a scoped person never gets figures cached for someone who sees more).
  const k = orgId + ':' + (() => { try { return String(useEvent().context.entityScope ?? '') } catch { return '' } })()
  const [live, books, trend, week, ticker] = await Promise.all([
    cached('live:' + k, 20_000, livePart), cached('books:' + k, 300_000, booksPart), cached('trend:' + k, 300_000, trendPart), cached('week:' + k, 60_000, weekPart),
    marketTicker().catch(() => ({ items: [], at: new Date().toISOString() }))])
  const year = trend.length ? trend.find((p) => p.d.startsWith(String(new Date().getUTCFullYear() - 1) + '-12'))?.v ?? null : null
  return { at: new Date().toISOString(), live, books, trend: [...trend, { d: new Date().toISOString().slice(0, 10), v: live.nav }], week, ticker: ticker.items, year_change_pct: year ? Math.round(((live.nav - year) / Math.abs(year)) * 1000) / 10 : null }
}
