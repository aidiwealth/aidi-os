// Where we stand in a portfolio company: what we put in (Investments & AUM), what it is recorded at, and what the
// company's latest round says it is worth now, from the founder's report answers or, for a company on Finvry, its own
// cap table (only our own lines are read, and only once it has shared updates with us; it is never told who looks).
import { currentPrice } from '~/shared/positions'
import { table as capTableCalc, type Data } from '~/shared/captable'

const norm = (s: string) => s.toLowerCase().replace(/&/g, ' and ').replace(/\b(ltd|limited|llc|l\.l\.c|inc|plc|lp|llp|corp|co|the|holdings?|technologies|technology)\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim()
export interface Holding { id: string; name: string; entity: string | null; currency: string; cost: number; value: number | null; realized: number; ownership_pct: number | null; instrument: string; cap: number | null; discount: number | null; shares: number | null; status: string; as_of: string | null }
export interface Mark { source: 'report' | 'finvry' | 'team'; period: string; label: string; kind: string | null; price_per_share: number | null; post_money: number | null; valuation_cap: number | null; fd_shares: number | null; our_shares: number | null; amount: number | null; round_name: string | null }
export interface Line { holding: Holding; implied: number | null; how: string }
export interface Position { company: string; holdings: Holding[]; lines: Line[]; marks: Mark[]; latest: Mark | null; cost: number; recorded: number | null; implied: number | null; diff: number | null; finvry: FinvryCap | null; currency: string }
export interface FinvryCap { as_of: string; price: number | null; price_source: string; fd: number; ours: { holder: string; shares: number; convertibles: { kind: string; amount: number; cap: number | null; post_money: boolean; discount: number | null }[]; pct_fd: number }[] }

export async function holdingsFor(companyId: string): Promise<Holding[]> {
  const c = (await db().query<{ name: string; holding_ids: string[] }>('SELECT name, holding_ids FROM portfolio.companies WHERE id = $1', [companyId])).rows[0]
  if (!c || !(await db().query("SELECT to_regclass('wealth.holdings') IS NOT NULL AS ok")).rows[0]?.ok) return []
  const rows = (await db().query<{ id: string; name: string; entity: string | null; currency: string; cost: string | null; current_value: string | null; realized: string | null; ownership_pct: string | null; status: string; as_of: string | null; meta: Record<string, unknown> }>(
    `SELECT h.id, h.name, e.name AS entity, h.currency, h.cost::text, h.current_value::text, h.realized::text, h.ownership_pct::text, h.status, to_char(h.as_of, 'YYYY-MM-DD') AS as_of, h.meta
     FROM wealth.holdings h LEFT JOIN core.entities e ON e.id = h.entity_id WHERE h.section = 'venture' OR h.id = ANY($1::uuid[])`, [c.holding_ids ?? []])).rows
  const want = norm(c.name)
  const pick = c.holding_ids?.length ? rows.filter((h) => c.holding_ids.includes(h.id)) : rows.filter((h) => { const a = norm(h.name), b = norm(String(h.meta?.legal_name ?? '')); return !!want && (a === want || b === want || (a.length > 3 && (a.includes(want) || want.includes(a)))) })
  const n = (v: unknown) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))
  return pick.map((h) => ({ id: h.id, name: h.name, entity: h.entity, currency: h.currency || 'USD', cost: n(h.cost) ?? 0, value: n(h.current_value), realized: n(h.realized) ?? 0, ownership_pct: n(h.ownership_pct), status: h.status,
    instrument: String(h.meta?.instrument ?? ''), cap: n(h.meta?.post_money_cap ?? h.meta?.valuation_cap), discount: n(h.meta?.discount), shares: n(h.meta?.shares), as_of: h.as_of }))
}

async function inOrg<T>(orgId: string, fn: () => Promise<T>): Promise<T> { const prev = currentOrgId(); setOrgContext(orgId); try { return await fn() } finally { setOrgContext(prev) } }
// Our own lines on a Finvry company's cap table (holders named like one of our entities or holdings).
export async function finvryCap(companyId: string, holdings: Holding[]): Promise<FinvryCap | null> {
  const c = (await db().query<{ finvry_org_id: string | null }>('SELECT finvry_org_id FROM portfolio.companies WHERE id = $1', [companyId])).rows[0]
  if (!c?.finvry_org_id) return null
  const viewer = currentOrgId()
  // Only once the company has shared an update with us (published, or sent to one of our people).
  const shared = await asPlatform(() => db().query(`SELECT 1 FROM financials.updates u WHERE u.organization_id = $1 AND (u.status = 'published' OR EXISTS (SELECT 1 FROM financials.update_sends s JOIN financials.investors i ON i.id = s.investor_id
    WHERE s.update_id = u.id AND lower(i.email) IN (SELECT lower(us.email) FROM core.memberships m JOIN core.users us ON us.id = m.user_id WHERE m.organization_id = $2 AND m.status = 'active'))) LIMIT 1`, [c.finvry_org_id, viewer]))
  if (!shared.rowCount) return null
  const ours = new Set([...(await db().query<{ name: string }>('SELECT name FROM core.entities')).rows.map((r) => norm(r.name)), ...holdings.map((h) => norm(h.entity ?? '')), (await currentOrg())?.name ? norm((await currentOrg())!.name) : ''].filter((x) => x.length > 2))
  const brand = [...ours].map((x) => x.split(' ')[0]!).filter((x) => x.length > 2)
  return inOrg(c.finvry_org_id, async () => {
    const ct = (await db().query<{ id: string; updated_at: string }>("SELECT id, to_char(updated_at, 'YYYY-MM-DD') AS updated_at FROM equity.captables ORDER BY is_main DESC, created_at LIMIT 1").catch(() => ({ rows: [] }))).rows[0]
    if (!ct) return null
    const d = await loadCapTable(ct.id) as unknown as Data
    const t = capTableCalc(d, new Date().toISOString().slice(0, 10))
    const mine = d.holders.filter((h) => { const x = norm(h.name); return ours.has(x) || brand.some((b) => x.split(' ')[0] === b && x.includes(b)) })
    if (!mine.length) return null
    const p = currentPrice(d)
    return { as_of: ct.updated_at, price: p.price, price_source: p.source, fd: t.fd,
      ours: mine.map((h) => { const r = t.rows.find((x) => x.holder.id === h.id); return { holder: h.name, shares: r?.fd ?? 0, pct_fd: t.fd ? ((r?.fd ?? 0) / t.fd) * 100 : 0,
        convertibles: d.convertibles.filter((c) => c.holder_id === h.id && c.status === 'outstanding').map((c) => ({ kind: c.kind, amount: c.amount, cap: c.valuation_cap, post_money: c.post_money, discount: c.discount_pct })) } }) }
  })
}

const isSafe = (h: Holding) => /safe|note|convertible/i.test(h.instrument) || (!!h.cap && !h.shares && !h.ownership_pct)
// What one holding is worth on the latest round: shares at the price; a SAFE or note at the round it converts in
// (cap or discount, whichever is better for us); a stake as a share of the post-money valuation.
function imply(h: Holding, m: Mark | null, fin: FinvryCap | null): { implied: number | null; how: string } {
  const price = m?.price_per_share ?? fin?.price ?? null
  if (h.shares && price) return { implied: h.shares * price, how: Math.round(h.shares).toLocaleString('en-US') + ' shares × ' + price.toLocaleString('en-US', { maximumFractionDigits: 4 }) }
  if (isSafe(h)) {
    if (m?.kind === 'priced' && m.post_money && h.cap) { const x = Math.max(1, m.post_money / h.cap); return { implied: h.cost * x, how: 'Converts at its cap in the priced round: ' + x.toFixed(2) + '× (post-money ' + Math.round(m.post_money / 1e6 * 10) / 10 + 'M against a ' + Math.round(h.cap / 1e6 * 10) / 10 + 'M cap)' } }
    if (m?.kind === 'priced' && h.discount) return { implied: h.cost / (1 - h.discount / 100), how: 'Converts at a ' + h.discount + '% discount' }
    return { implied: h.cost, how: 'Not converted yet: held at cost' + (m?.valuation_cap && h.cap && m.valuation_cap > h.cap ? ' (a later SAFE at a ' + Math.round(m.valuation_cap / 1e6 * 10) / 10 + 'M cap suggests ' + (m.valuation_cap / h.cap).toFixed(2) + '× if it converts there)' : '') }
  }
  if (h.ownership_pct && m?.post_money) return { implied: (h.ownership_pct / 100) * m.post_money, how: h.ownership_pct + '% of a ' + Math.round(m.post_money / 1e6 * 10) / 10 + 'M post-money valuation' }
  return { implied: null, how: 'Needs a price per share or post-money valuation from the latest round' }
}

export async function positionOf(companyId: string): Promise<Position> {
  const c = (await db().query<{ name: string }>('SELECT name FROM portfolio.companies WHERE id = $1', [companyId])).rows[0]
  if (!c) throw apiError('not_found', 'Not found', 404)
  const holdings = await holdingsFor(companyId)
  const marks = (await db().query<Mark & { period: string }>(`SELECT source, to_char(period, 'YYYY-MM-DD') AS period, kind, round_name, amount::float, price_per_share::float, post_money::float, valuation_cap::float, fd_shares::float, our_shares::float
    FROM portfolio.cap_updates WHERE company_id = $1 AND (new_money IS NOT FALSE OR fd_shares IS NOT NULL OR our_shares IS NOT NULL) ORDER BY period DESC, created_at DESC LIMIT 24`, [companyId])).rows
    .map((m) => ({ ...m, label: (m.source === 'report' ? 'Founder report' : m.source === 'finvry' ? 'Their cap table' : 'Team') + ', ' + m.period.slice(0, 7) }))
  const fin = await finvryCap(companyId, holdings).catch((e) => { console.error('[position] finvry cap', (e as Error).message); return null })
  // Founder-reported shares we hold fill a holding that has none recorded.
  const latest = marks.find((m) => m.price_per_share || m.post_money || m.valuation_cap) ?? null
  const ourShares = fin ? fin.ours.reduce((a, o) => a + o.shares, 0) : marks.find((m) => m.our_shares)?.our_shares ?? null
  const hs = holdings.map((h) => (!h.shares && !isSafe(h) && ourShares && holdings.filter((x) => !isSafe(x)).length === 1 ? { ...h, shares: ourShares } : h))
  const lines = hs.map((h) => ({ holding: h, ...imply(h, latest, fin) }))
  const cost = hs.reduce((a, h) => a + h.cost, 0)
  const recorded = hs.some((h) => h.value !== null) ? hs.reduce((a, h) => a + (h.value ?? h.cost), 0) : null
  const implied = lines.length && lines.every((l) => l.implied !== null) ? lines.reduce((a, l) => a + (l.implied ?? 0), 0) : null
  return { company: c.name, holdings: hs, lines, marks, latest, cost, recorded, implied, diff: implied !== null && recorded !== null ? implied - recorded : null, finvry: fin, currency: hs[0]?.currency ?? 'USD' }
}
