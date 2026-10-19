// Intercompany eliminations for the group (consolidated) view.
// A parent and its subsidiaries owe each other money (intercompany receivables and payables) and may bill each other
// (management fees, recharged hosting). Adding the statements together counts those twice, so the group view takes them out.
// A category is intercompany when the company marked it so (financials.accounts.intercompany) or, by default, when its
// name says so: "Intercompany receivable – Termii Inc", "Inter-company payable", "Due from parent", "Intra-group loan".
export const IC_NAME = /\binter-?\s?company\b|\bintra-?\s?group\b|\bdue (from|to) (the )?(parent|subsidiary|group|holding company)\b/i

const ASSET = ['cash', 'receivables', 'investments', 'long_term_investments', 'other_assets']
const LIAB = ['payables', 'debt', 'other_liabilities']
const INCOME = ['revenue', 'other_income']
const COST = ['cogs', 'opex_payroll', 'opex_marketing', 'opex_rnd', 'opex_ga', 'opex_other']

type L = Record<string, number | null | undefined>
export interface Member { lines: L; detail?: Record<string, number> | null; rate: number; who?: string }
export interface Eliminated {
  receivables: number // intercompany assets taken out
  payables: number // intercompany liabilities taken out
  equity: number // intercompany items in equity (e.g. "Inter-company transfers"), reported only
  unreconciled: number // receivables − payables − equity items: the two sides do not agree by this much
  income: number // intercompany revenue / other income taken out
  costs: number // intercompany costs taken out
  items: { line: string; name: string; value: number; who: string }[]
}

const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const add = (t: L, k: string, v: number) => { t[k] = (n(t[k]) ?? 0) + v }
// Only adjust a total the members gave (never invent one).
const adj = (t: L, k: string, v: number) => { if (n(t[k]) !== null) t[k] = (t[k] as number) + v }
const r2 = (v: number) => Math.round(v * 100) / 100

export function isIntercompany(name: string, tagged: Set<string> = new Set()): boolean {
  return tagged.has(name.trim().toLowerCase()) || IC_NAME.test(name)
}

// Adds the members together (each converted with its rate) and removes intercompany balances and trading.
// The balance sheet still balances: equity moves by (receivables − payables) taken out, and the part the two sides
// do not agree on is reported as `unreconciled` so the user can fix it in the books.
export function consolidate(members: Member[], keys: string[], tagged: Set<string> = new Set()): { lines: L; eliminated: Eliminated } {
  const t: L = {}
  const e: Eliminated = { receivables: 0, payables: 0, equity: 0, unreconciled: 0, income: 0, costs: 0, items: [] }
  for (const m of members) {
    for (const k of keys) { const v = n(m.lines[k]); if (v !== null) add(t, k, v * m.rate) }
    for (const [key, raw] of Object.entries(m.detail ?? {})) {
      const i = key.indexOf('|'); if (i < 0) continue
      const line = key.slice(0, i), name = key.slice(i + 1), v = n(raw)
      if (v === null || v === 0 || !line || !isIntercompany(name, tagged)) continue
      const x = v * m.rate
      if (ASSET.includes(line)) { adj(t, line, -x); adj(t, 'total_assets', -x); e.receivables += x }
      else if (LIAB.includes(line)) { adj(t, line, -x); adj(t, 'total_liabilities', -x); e.payables += x }
      else if (line === 'equity') { e.equity += x }
      else if (INCOME.includes(line)) {
        adj(t, line, -x); e.income += x
        if (line === 'revenue') { adj(t, 'gross_profit', -x); adj(t, 'ebitda', -x) }
        adj(t, 'net_income', -x)
      } else if (COST.includes(line)) {
        adj(t, line, -x); e.costs += x
        if (line === 'cogs') adj(t, 'gross_profit', x); else adj(t, 'opex_total', -x)
        adj(t, 'ebitda', x); adj(t, 'net_income', x)
      } else continue
      e.items.push({ line, name, value: r2(x), who: m.who ?? '' })
    }
  }
  const net = e.receivables - e.payables
  if (net) adj(t, 'equity', -net)
  e.unreconciled = r2(net - e.equity)
  for (const k of ['receivables', 'payables', 'equity', 'income', 'costs'] as const) e[k] = r2(e[k])
  return { lines: t, eliminated: e }
}
