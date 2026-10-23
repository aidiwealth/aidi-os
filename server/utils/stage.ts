// Venture & Business Stage Monitor (Finvry): gathers the company's own figures — monthly statements, burn and runway,
// cap table, customer retention, data room and bank history — and works out its stage, health and readiness with the
// rules in shared/stage.ts. The current month is kept as a snapshot so the history builds up.
import { DEFAULT_RULES, regionOf, fundingStage, classStage, operatingStage, defaultAlive, health, equityScore, debtScore, movesUp, FUNDING_LABEL, OPERATING_LABEL, HEALTH_LABEL, HEALTH_NOTE, type StageRules, type Inputs, type Mo, type CapFacts, type Funding } from '~/shared/stage'
import { deriveLines, withSecurities, burnReview, type FinRow } from '~/shared/fin-view'
import { table as capTable } from '~/shared/captable'
import { retention, span } from '~/shared/customer-metrics'
import type { H3Event } from 'h3'

export async function stageRules(): Promise<StageRules> {
  const v = (await asPlatform(() => db().query<{ value: Partial<StageRules> }>("SELECT value FROM platform.settings WHERE key = 'stage_rules'"))).rows[0]?.value
  return v ? { regions: { ...DEFAULT_RULES.regions, ...(v.regions ?? {}) }, equity: { ...DEFAULT_RULES.equity, ...(v.equity ?? {}) }, debt: { ...DEFAULT_RULES.debt, ...(v.debt ?? {}) } } : DEFAULT_RULES
}
// Readiness scores from Medium, matched funders on Scale (a Finvry admin can grant more with extra modules).
export function stageTier(planCode: string | null | undefined): number { return planCode === 'company_scale' ? 3 : planCode === 'company_medium' ? 2 : 1 }

async function capFacts(currency: string): Promise<CapFacts> {
  const list = await capTables().catch(() => [])
  const main = list.find((c) => c.is_main) ?? list[0]
  if (!main) return { has: false, raised_usd: 0, priced_round: null, founders_pct: null, pool: false, safes: 0 }
  const d = await loadCapTable(main.id), t = capTable(d, new Date().toISOString().slice(0, 10))
  const usd = async (c: string) => (c === 'USD' ? 1 : (await fxRate(c, 'USD')) ?? 0)
  let raised = 0
  for (const c of d.convertibles) raised += c.amount * await usd(c.currency || currency)
  const pref = new Set(d.classes.filter((c) => c.kind === 'preferred').map((c) => c.id)), k = await usd(currency)
  let round: { on: string; stage: Funding } | null = null
  for (const i of d.issuances) {
    if (!pref.has(i.class_id)) continue
    raised += (i.price ?? 0) * i.shares * k
    const st = classStage(d.classes.find((c) => c.id === i.class_id)?.name ?? '')
    if (st && (!round || i.issued_on > round.on)) round = { on: i.issued_on, stage: st }
  }
  const founders = t.rows.filter((r) => r.holder.kind === 'founder')
  return { has: true, raised_usd: Math.round(raised), priced_round: round?.stage ?? null, founders_pct: founders.length ? founders.reduce((s, r) => s + r.pctFd, 0) : null, pool: d.plans.some((p) => p.reserved > 0), safes: d.convertibles.filter((c) => c.status === 'outstanding').length }
}

export async function stageMonitor(event: H3Event) {
  const org = (await currentOrg())!, s = org.settings as Record<string, unknown>
  const ent = await companyEntityId()
  const rules = await stageRules(), region = regionOf(s.country as string), rr = rules.regions[region]
  const cur = (s.reporting_currency as string) || (s.currency as string) || 'USD'
  const usd = cur === 'USD' ? 1 : (await fxRate(cur, 'USD')) ?? 0
  const plan = (await db().query<{ plan_code: string }>('SELECT plan_code FROM core.organizations WHERE id = core.current_org()')).rows[0]?.plan_code
  const tier = stageTier(plan), usable = await usableModules((event.context.user as SessionUser).roles, event)
  // Statements (in the reporting currency), burn and runway on the same basis as Financials.
  const rows = ent ? (await loadStatements('entity:' + ent, 'month', cur)).filter((r) => r.period_type === 'month').slice(-24) : []
  const sec = await cashPolicy()
  const fr: FinRow[] = rows.map((r) => ({ period_end: r.period_end, period_type: 'month', currency: r.currency, lines: r.lines, kpis: {}, derived: withSecurities(deriveLines(r.lines, 1), sec) }))
  const burn = burnReview(fr)
  const months: Mo[] = rows.map((r) => {
    const d = derive(r.lines, 'month'), exp = d.cogs === null && d.opex_total === null ? null : (d.cogs ?? 0) + (d.opex_total ?? 0)
    return { month: String(r.period_end).slice(0, 7), revenue: d.revenue, expenses: exp, net: d.net_income ?? (d.ebitda !== null ? d.ebitda : null), ebitda: d.ebitda, gross_margin: d.gross_margin, cash: d.cash, debt: d.debt ?? null }
  })
  // Customer revenue for this company (net revenue retention over 12 months), when the plan includes it.
  let nrr: number | null = null
  const retentionOn = usable.has('fin_customers')
  if (retentionOn && ent) {
    try { event.context.custEntity = ent; const cfg = await customerConfig(), cs = await loadCustomers(), sp = span(cs); if (sp) nrr = retention(cs, sp.last, 12, cfg.retention_basis ?? 'month').nrr } catch { nrr = null }
  }
  const q = async (sql: string, p: unknown[] = []) => (await db().query<{ n: number }>(sql, p).catch(() => ({ rows: [{ n: 0 }] }))).rows[0]?.n ?? 0
  const room = { deck: (await q('SELECT count(*)::int AS n FROM fundraise.files WHERE is_deck')) > 0, files: await q('SELECT count(*)::int AS n FROM fundraise.files'), links: await q('SELECT count(*)::int AS n FROM fundraise.links WHERE NOT revoked') }
  const bank = { connected: (await q('SELECT count(*)::int AS n FROM banking.plaid_items WHERE wm_client_id IS NULL AND error IS NULL')) > 0,
    months: ent ? await q("SELECT count(DISTINCT to_char(s.period_end, 'YYYY-MM'))::int AS n FROM banking.statements s JOIN banking.accounts a ON a.id = s.account_id WHERE a.entity_id = $1 AND s.period_end > now() - interval '13 months' AND s.continuity_ok IS NOT FALSE", [ent]) : 0 }
  // Payments marked to cancel in Banking & Treasury: what they cost a month (last three full months), for the runway after cutting them.
  const cutMonthly = Number((await db().query<{ v: string | null }>(`SELECT sum(l.amount_base) / 3 AS v FROM banking.ledger l JOIN banking.vendors v ON v.vendor_key = l.vendor_key AND v.status = 'to_cancel'
    WHERE l.direction = 'out' AND l.txn_date >= date_trunc('month', now()) - interval '3 months' AND l.txn_date < date_trunc('month', now())`).catch(() => ({ rows: [{ v: null }] }))).rows[0]?.v ?? 0)
  const cap = await capFacts(cur)
  const i: Inputs = { months, usd, runway: burn.runway, cash: burn.cash ?? [...months].reverse().find((m) => m.cash !== null)?.cash ?? null, cash_at: burn.cash_at, cap, nrr, retention_on: retentionOn, room, bank }
  const fund = fundingStage(cap, rr), lastRev = [...months].reverse().find((m) => m.revenue !== null)?.revenue ?? 0
  const arrUsd = Math.max(0, lastRev) * 12 * usd, op = operatingStage(arrUsd, rr)
  const alive = defaultAlive(i), hl = health(i, alive)
  const eq = tier >= 2 ? equityScore(i, rr, rules.equity, fund) : null, dt = tier >= 2 ? debtScore(i, rules.debt) : null
  const cashOut = burn.runway !== null && burn.runway < 120 && burn.cash_at ? (() => { const d = new Date(burn.cash_at + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + Math.floor(burn.runway!)); return d.toISOString().slice(0, 7) })() : null
  // Keep this month's snapshot (the history), then read the last two years of them.
  const period = new Date().toISOString().slice(0, 7)
  if (ent) await db().query(`INSERT INTO financials.stage_snapshots (entity_id, period, funding_stage, operating_stage, health, runway, cash_out, equity_score, debt_score, inputs) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    ON CONFLICT (organization_id, entity_id, period) DO UPDATE SET funding_stage = EXCLUDED.funding_stage, operating_stage = EXCLUDED.operating_stage, health = EXCLUDED.health, runway = EXCLUDED.runway, cash_out = EXCLUDED.cash_out, equity_score = EXCLUDED.equity_score, debt_score = EXCLUDED.debt_score, inputs = EXCLUDED.inputs, updated_at = now()`,
    [ent, period, fund, op, hl, burn.runway, cashOut, eq?.total ?? null, dt?.total ?? null, JSON.stringify({ arr_usd: Math.round(arrUsd), raised_usd: cap.raised_usd, region, nrr })]).catch((e) => console.error('[stage] snapshot', e))
  const history = ent ? (await db().query<{ period: string; funding_stage: string; operating_stage: string; health: string; runway: string | null; equity_score: number | null; debt_score: number | null }>('SELECT period, funding_stage, operating_stage, health, runway, equity_score, debt_score FROM financials.stage_snapshots WHERE entity_id = $1 ORDER BY period DESC LIMIT 24', [ent])).rows.reverse() : []
  const capView = cap.has ? await (async () => { const list = await capTables(); const main = list.find((c) => c.is_main) ?? list[0]!; const d = await loadCapTable(main.id), t = capTable(d, new Date().toISOString().slice(0, 10))
    const by: Record<string, number> = {}; for (const r of t.rows) by[r.holder.kind] = (by[r.holder.kind] ?? 0) + r.pctFd
    return { name: main.name, fully_diluted: t.fd, pool_available: t.pool, by_kind: Object.entries(by).map(([kind, pct]) => ({ kind, pct: Math.round(pct * 10) / 10 })).sort((a, b) => b.pct - a.pct), safes: cap.safes, raised_usd: cap.raised_usd } })() : null
  return {
    company: org.name, currency: cur, region, region_label: rr.label, tier, country: (s.country as string) || null, as_of: months[months.length - 1]?.month ?? null,
    funding: { key: fund, label: FUNDING_LABEL[fund], basis: cap.priced_round ? 'Your latest priced round on the cap table' : cap.has ? 'Money raised on your cap table (SAFEs, notes and preferred shares): about $' + cap.raised_usd.toLocaleString('en-US') : 'No cap table yet' },
    operating: { key: op, label: OPERATING_LABEL[op], arr_usd: Math.round(arrUsd), basis: 'Annual run rate from the latest month of revenue, against ' + rr.label + ' benchmarks' },
    health: { key: hl, label: HEALTH_LABEL[hl], note: HEALTH_NOTE[hl] },
    runway: { months: burn.runway, cash_out: cashOut, burn: burn.burn, cash: i.cash, cash_at: burn.cash_at, basis: burn.basis, cut_monthly: Math.round(cutMonthly), if_cut: cutMonthly && burn.burn && i.cash !== null ? (burn.burn - cutMonthly <= 0 ? null : Math.round(i.cash / (burn.burn - cutMonthly) * 10) / 10) : null },
    alive, months, cap: capView,
    equity: eq, debt: dt, moves: movesUp(eq, dt),
    history }
}

// Capital providers matched to the company: its country (or global), the round it would raise next, its sector.
const NEXT_RAISE: Record<Funding, string> = { bootstrapped: 'pre_seed', pre_seed: 'seed', seed: 'series_a', series_a: 'series_b', series_b: 'growth', growth: 'growth' }
export async function matchProviders(country: string | null, fund: Funding, sector: string | null) {
  const rows = (await asPlatform(() => db().query<{ id: string; name: string; kind: string; instrument: string; countries: string[]; stages: string[]; sectors: string[]; ticket_min: string | null; ticket_max: string | null; currency: string; criteria: string | null; link: string | null; affiliate: boolean }>(
    'SELECT id, name, kind, instrument, countries, stages, sectors, ticket_min, ticket_max, currency, criteria, link, affiliate FROM platform.capital_providers WHERE active AND verified_on IS NOT NULL ORDER BY name'))).rows
  const want = [fund, NEXT_RAISE[fund]], sec = (sector ?? '').toLowerCase()
  return rows.map((p) => {
    const cty = !p.countries.length || p.countries.some((c) => /^(global|worldwide|any)$/i.test(c)) ? 1 : country && p.countries.some((c) => c.toLowerCase() === country.toLowerCase()) ? 3 : 0
    const stg = !p.stages.length ? 1 : p.stages.some((x) => want.includes(x as Funding)) ? 3 : 0
    const sct = !p.sectors.length ? 1 : sec && p.sectors.some((x) => sec.includes(x.toLowerCase()) || x.toLowerCase().includes(sec)) ? 2 : 0
    return { ...p, ticket_min: p.ticket_min === null ? null : Number(p.ticket_min), ticket_max: p.ticket_max === null ? null : Number(p.ticket_max), fit: cty && stg ? cty + stg + sct : 0 }
  }).filter((p) => p.fit > 0).sort((a, b) => b.fit - a.fit || Number(b.affiliate) - Number(a.affiliate)).slice(0, 30)
}
