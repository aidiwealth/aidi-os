// Monthly forecast engine for Finvry companies (runs in the browser and on the server). Driver-based: revenue from a
// growth rate or from customers x price, costs as a % of revenue or monthly amounts that grow, people from today's
// payroll plus planned hires, and funding or one-off items. Three scenarios adjust growth and costs.
export interface CostLine { key: string; label: string; amount: number; growth_pct: number }
export interface Hire { role: string; start: string; monthly_cost: number }
export interface OneOff { label: string; month: string; amount: number }
export interface Assumptions {
  start: string; months: number; currency: string
  opening: { cash: number; revenue: number; customers: number; headcount: number; payroll: number }
  revenue: { mode: 'growth' | 'customers'; growth_pct: number; new_customers: number; new_growth_pct: number; churn_pct: number; arpu: number; arpu_growth_pct: number }
  cogs_pct: number
  costs: CostLine[]
  payroll_raise_pct: number
  hires: Hire[]
  items: OneOff[]
  funding: OneOff[]
  tax_pct: number
  scenarios: { best: { growth: number; costs: number }; worst: { growth: number; costs: number } }
  // Months given as figures (an accountant's forecast): they replace the drivers for those months; drivers carry on
  // from the last given month. Costs are positive; items are signed (+ in, − out).
  fixed?: Record<string, FixedMonth>
  source?: { file: string; imported_at: string; lines: { label: string; maps_to: string }[] }
  // The company's own lines inside a standard line: products under Revenue, carriers under Cost of revenue, Rent under
  // General & admin. Shown under their line; in given months they take the figures given, after that their share of it.
  parts?: Part[]
}
export interface Part { key: string; label: string; parent: string; share_pct: number }
export interface FixedMonth { revenue?: number; cogs?: number; payroll?: number; costs?: Record<string, number>; tax?: number; items?: number; funding?: number; customers?: number; headcount?: number; parts?: Record<string, number> }
export const FIXED_KEYS: { key: string; label: string }[] = [{ key: 'revenue', label: 'Revenue' }, { key: 'cogs', label: 'Cost of revenue' }, { key: 'payroll', label: 'Payroll' }, ...COST_LINES_BASE(), { key: 'tax', label: 'Tax' }, { key: 'items', label: 'One-off items (capex, loans…)' }, { key: 'funding', label: 'Funding raised' }, { key: 'customers', label: 'Customers' }, { key: 'headcount', label: 'Headcount' }]
function COST_LINES_BASE() { return [{ key: 'marketing', label: 'Sales & marketing' }, { key: 'rnd', label: 'Product & engineering (non-payroll)' }, { key: 'ga', label: 'General & admin' }, { key: 'other', label: 'Other operating costs' }] }
export type Scenario = 'base' | 'best' | 'worst'
export interface Month { parts: Record<string, number>; month: string; revenue: number; cogs: number; gross_profit: number; gross_margin: number | null; payroll: number; costs: Record<string, number>; opex: number; ebitda: number; tax: number; net_income: number; items: number; funding: number; cash_flow: number; cash: number; burn: number; customers: number | null; headcount: number; arr: number }
export interface Result { months: Month[]; summary: { cash_end: number; zero_cash: string | null; runway: number | null; break_even: string | null; revenue_total: number; net_total: number; funding_total: number; arr_end: number; min_cash: number; min_cash_month: string } }

export const COST_LINES: { key: string; label: string }[] = COST_LINES_BASE()
export const addMonths = (ym: string, n: number) => { const d = new Date(ym + '-01T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 7) }
export function defaults(start: string, o?: Partial<Assumptions['opening']>, costs?: Partial<Record<string, number>>, currency = 'USD'): Assumptions {
  return { start, months: 24, currency,
    opening: { cash: o?.cash ?? 0, revenue: o?.revenue ?? 0, customers: o?.customers ?? 0, headcount: o?.headcount ?? 0, payroll: o?.payroll ?? 0 },
    revenue: { mode: 'growth', growth_pct: 5, new_customers: 10, new_growth_pct: 3, churn_pct: 2, arpu: o?.customers && o?.revenue ? Math.round(o.revenue / o.customers) : 100, arpu_growth_pct: 0 },
    cogs_pct: 30, costs: COST_LINES.map((c) => ({ ...c, amount: costs?.[c.key] ?? 0, growth_pct: 1 })), payroll_raise_pct: 5, hires: [], items: [], funding: [], tax_pct: 0,
    scenarios: { best: { growth: 3, costs: -5 }, worst: { growth: -3, costs: 10 } } }
}
const r2 = (n: number) => Math.round(n * 100) / 100
export function run(a: Assumptions, scenario: Scenario = 'base'): Result {
  const adj = scenario === 'base' ? { growth: 0, costs: 0 } : a.scenarios[scenario]
  const cm = 1 + adj.costs / 100
  const out: Month[] = []
  let cash = a.opening.cash, revenue = a.opening.revenue, customers = a.opening.customers, arpu = a.revenue.arpu, newC = a.revenue.new_customers, payroll = a.opening.payroll
  const lines = a.costs.map((c) => ({ ...c, cur: c.amount }))
  const fixed = a.fixed ?? {}, lastFixed = Object.keys(fixed).sort().pop() ?? '', fixedPay = Object.values(fixed).some((x) => x.payroll !== undefined)
  let head = a.opening.headcount
  for (let i = 0; i < a.months; i++) {
    const m = addMonths(a.start, i), f = fixed[m], sf = Math.pow(1 + adj.growth / 100, i)
    if (f?.revenue !== undefined) { revenue = f.revenue * sf; if (f.customers !== undefined) customers = f.customers; if (customers > 0) arpu = revenue / customers }
    else if (a.revenue.mode === 'customers') {
      if (i > 0) { newC = newC * (1 + (a.revenue.new_growth_pct + adj.growth) / 100); arpu = arpu * (1 + a.revenue.arpu_growth_pct / 100) }
      customers = Math.max(0, customers * (1 - a.revenue.churn_pct / 100) + newC)
      revenue = customers * arpu
    } else if (i > 0) revenue = revenue * (1 + (a.revenue.growth_pct + adj.growth) / 100)
    if (i > 0 && m.endsWith('-01')) payroll = payroll * (1 + a.payroll_raise_pct / 100)
    // Hires starting inside the given months are assumed to be in the given payroll and headcount.
    const hires = a.hires.filter((h) => h.start <= m && !(fixedPay && h.start <= lastFixed))
    if (f?.payroll !== undefined) payroll = f.payroll
    if (f?.headcount !== undefined) head = f.headcount
    const pay = (payroll + hires.reduce((s, h) => s + h.monthly_cost, 0)) * cm
    const costs: Record<string, number> = {}
    for (const l of lines) { const fv = f?.costs?.[l.key]; if (fv !== undefined) l.cur = fv; else if (i > 0) l.cur = l.cur * (1 + l.growth_pct / 100); costs[l.key] = r2(l.cur * cm) }
    const cogs = f?.cogs !== undefined ? f.cogs * (f.revenue ? revenue / f.revenue : 1) : revenue * a.cogs_pct / 100, gross = revenue - cogs
    const opex = pay + Object.values(costs).reduce((s, v) => s + v, 0)
    const ebitda = gross - opex, tax = f?.tax !== undefined ? f.tax : ebitda > 0 ? ebitda * a.tax_pct / 100 : 0, net = ebitda - tax
    const items = a.items.filter((x) => x.month === m).reduce((s, x) => s + x.amount, 0) + (f?.items ?? 0)
    const funding = a.funding.filter((x) => x.month === m).reduce((s, x) => s + x.amount, 0) + (f?.funding ?? 0)
    const flow = net + items + funding
    cash += flow
    // The company's own lines: the figures given for this month, scaled with their line (scenarios), else their share.
    const parts: Record<string, number> = {}
    if (a.parts?.length) {
      const val: Record<string, number> = { revenue, cogs, payroll: pay, items, funding, tax, ...costs }
      const raw = (p: string) => (p === 'revenue' || p === 'cogs' || p === 'payroll' || p === 'items' || p === 'funding' || p === 'tax' ? f?.[p] : f?.costs?.[p])
      for (const pt of a.parts) {
        const g = f?.parts?.[pt.key], tot = val[pt.parent] ?? 0
        if (g !== undefined) { const rw = raw(pt.parent); parts[pt.key] = r2(rw ? g * tot / rw : g) }
        else if (f?.parts && Object.keys(f.parts).length && a.parts.some((q) => q.parent === pt.parent && f.parts![q.key] !== undefined)) parts[pt.key] = 0
        else parts[pt.key] = pt.parent === 'items' || pt.parent === 'funding' ? 0 : r2(tot * (pt.share_pct || 0) / 100)
      }
    }
    out.push({ parts, month: m, revenue: r2(revenue), cogs: r2(cogs), gross_profit: r2(gross), gross_margin: revenue ? Math.round(gross / revenue * 1000) / 10 : null, payroll: r2(pay), costs, opex: r2(opex), ebitda: r2(ebitda), tax: r2(tax), net_income: r2(net), items: r2(items), funding: r2(funding), cash_flow: r2(flow), cash: r2(cash), burn: r2(Math.max(0, -(net + items))), customers: f?.customers !== undefined || a.revenue.mode === 'customers' ? Math.round(customers) : (a.opening.customers || null), headcount: head + hires.length, arr: r2(revenue * 12) })
  }
  const zero = out.find((x) => x.cash < 0)
  const be = out.find((x) => x.net_income >= 0 && x.revenue > 0)
  const last = out[out.length - 1]
  const recentBurn = out.slice(0, 3).reduce((s, x) => s + x.burn, 0) / Math.max(1, Math.min(3, out.length))
  const min = out.reduce((m, x) => (x.cash < m.cash ? x : m), out[0] ?? { cash: 0, month: a.start } as Month)
  return { months: out, summary: { cash_end: last?.cash ?? a.opening.cash, zero_cash: zero?.month ?? null, runway: zero ? out.indexOf(zero) : recentBurn > 0 ? Math.round(a.opening.cash / recentBurn * 10) / 10 : null, break_even: be?.month ?? null,
    revenue_total: r2(out.reduce((s, x) => s + x.revenue, 0)), net_total: r2(out.reduce((s, x) => s + x.net_income, 0)), funding_total: r2(out.reduce((s, x) => s + x.funding, 0)), arr_end: last?.arr ?? 0, min_cash: min?.cash ?? 0, min_cash_month: min?.month ?? a.start } }
}
// What a forecast can be built from: the statements in Financials and the connected bank accounts.
export interface FinSource { months: number; latest: string; revenue: number; costs: number; net: number; growth: number | null; cash: number | null }
export interface BankSource { partial?: boolean; reported?: number | null; reported_as_of?: string | null; connected: boolean; enabled: boolean; accounts: { institution: string; name: string; mask: string | null; currency: string; balance: number | null; debt: boolean; updated_at: string }[]; cash: number; as_of: string | null; months: { month: string; in: number; out: number; net: number; partial?: boolean }[]; spend: { label: string; amount: number; pct?: number }[]; avg_in: number; avg_out: number; burn: number; full_months: number }
// A company in the group forecast: the forecast it uses and its plan rate (units of its currency for 1 of the group's).
export interface GroupCo { id: string; name: string; currency: string; main: boolean; per: number | null; rate_source: 'same' | 'plan' | 'book' | 'daily' | 'none'; forecasts: { id: string; name: string; updated_at: string; is_main: boolean }[]; use: { id: string; name: string; assumptions: Assumptions } | null }

// Lines a part can sit under, for a forecast (the standard lines and the company's own cost lines).
export const partParents = (a: Pick<Assumptions, 'costs'>) => [{ key: 'revenue', label: 'Revenue' }, { key: 'cogs', label: 'Cost of revenue' }, { key: 'payroll', label: 'Payroll' }, ...a.costs.map((c) => ({ key: c.key, label: c.label })), { key: 'tax', label: 'Tax' }, { key: 'items', label: 'One-off items (capex, loans…)' }, { key: 'funding', label: 'Funding raised' }]
export const PART_PARENT_KEYS = ['revenue', 'cogs', 'payroll', 'marketing', 'rnd', 'ga', 'other', 'tax', 'items', 'funding']
// "Subscriptions (in Revenue)": a line of detail inside a forecast line, by the line's name. Returns the line's key.
const nmz = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
export function partParentOf(label: string): string | null {
  const m = /\(in ([^)]+)\)\s*$/i.exec(label.trim()); if (!m) return null
  const n = nmz(m[1]!)
  const all = [...FIXED_KEYS, { key: 'items', label: 'one off items' }, { key: 'funding', label: 'funding' }, { key: 'payroll', label: 'staff costs' }, { key: 'rnd', label: 'product and engineering' }, { key: 'ga', label: 'general and admin' }, { key: 'marketing', label: 'sales and marketing' }]
  const hit = all.find((k) => nmz(k.label) === n) ?? all.find((k) => nmz(k.label).startsWith(n + ' ') || n.startsWith(nmz(k.label) + ' '))
  return hit && PART_PARENT_KEYS.includes(hit.key) ? hit.key : null
}
export const partLabel = (label: string) => label.replace(/\s*\(in [^)]+\)\s*$/i, '').trim().slice(0, 80) || label.slice(0, 80)
export function partKey(label: string, taken: Iterable<string>): string {
  const t = new Set(taken); let k = 'p_' + (nmz(partLabel(label)).replace(/ /g, '_').slice(0, 40) || 'line'); const b = k; let i = 2
  while (t.has(k)) k = b + '_' + i++
  return k
}
// Each part's share of its line in the last month that gives both (how the mix carries on after the given months).
export function partShares(a: Assumptions) {
  if (!a.parts?.length || !a.fixed) return
  const ms = Object.keys(a.fixed).sort().reverse()
  for (const pt of a.parts) {
    for (const m of ms) {
      const f = a.fixed[m]!, g = f.parts?.[pt.key]; if (g === undefined) continue
      const tot = pt.parent === 'revenue' || pt.parent === 'cogs' || pt.parent === 'payroll' || pt.parent === 'tax' ? f[pt.parent] : pt.parent === 'items' || pt.parent === 'funding' ? f[pt.parent] : f.costs?.[pt.parent]
      if (tot) { pt.share_pct = Math.round(g / tot * 1000) / 10; break }
    }
  }
}
// The monthly table: every line, with the company's own lines under the line they belong to (and what is left of that
// line, when they do not add up to it). kind: b bold, s a part, p a percentage, n a count, h highlighted.
export type FRow = { label: string; get: (x: Month) => number | null; kind?: 'b' | 's' | 'p' | 'n' | 'h' }
export function forecastRows(a: Assumptions, months: Month[]): FRow[] {
  const parts = a.parts ?? []
  const under = (parent: string, sign: number, plabel: string, total: (x: Month) => number): FRow[] => {
    const ps = parts.filter((p) => p.parent === parent); if (!ps.length) return []
    const rows: FRow[] = ps.map((p) => ({ label: p.label, get: (x) => sign * (x.parts[p.key] ?? 0), kind: 's' }))
    const rest = (x: Month) => total(x) - ps.reduce((s, p) => s + (x.parts[p.key] ?? 0), 0)
    if (months.some((x) => Math.abs(rest(x)) > 0.5)) rows.push({ label: 'Other ' + plabel.toLowerCase(), get: (x) => sign * rest(x), kind: 's' })
    return rows
  }
  return [
    { label: 'Revenue', get: (x) => x.revenue, kind: 'b' }, ...under('revenue', 1, 'Revenue', (x) => x.revenue),
    { label: 'Cost of revenue', get: (x) => -x.cogs }, ...under('cogs', -1, 'Cost of revenue', (x) => x.cogs),
    { label: 'Gross profit', get: (x) => x.gross_profit, kind: 'b' }, { label: 'Gross margin %', get: (x) => x.gross_margin, kind: 'p' },
    { label: 'Payroll', get: (x) => -x.payroll }, ...under('payroll', -1, 'Payroll', (x) => x.payroll),
    ...a.costs.flatMap((c) => [{ label: c.label, get: (x: Month) => -(x.costs[c.key] ?? 0) } as FRow, ...under(c.key, -1, c.label, (x) => x.costs[c.key] ?? 0)]),
    { label: 'Operating costs', get: (x) => -x.opex, kind: 'b' }, { label: 'EBITDA', get: (x) => x.ebitda, kind: 'b' },
    { label: 'Tax', get: (x) => -x.tax }, ...under('tax', -1, 'Tax', (x) => x.tax), { label: 'Net income', get: (x) => x.net_income, kind: 'b' },
    { label: 'One-off items', get: (x) => x.items }, ...under('items', 1, 'One-off items', (x) => x.items),
    { label: 'Funding', get: (x) => x.funding }, ...under('funding', 1, 'Funding', (x) => x.funding),
    { label: 'Net cash flow', get: (x) => x.cash_flow, kind: 'b' }, { label: 'Cash at month end', get: (x) => x.cash, kind: 'h' },
    { label: 'Customers', get: (x) => x.customers, kind: 'n' }, { label: 'Headcount', get: (x) => x.headcount, kind: 'n' }, { label: 'ARR', get: (x) => x.arr }]
}
