// KPIs for the group (consolidated) view. Statements keep KPIs as { name: value } with no unit, so the group view
// decides per KPI how to combine the companies:
//  - ratio  ("CAC per new paying customer", "Revenue per user", margins, rates, %): never added; worked out again
//           from the group totals of its two parts when both are there ("CAC related costs" / "New paying customers"),
//           otherwise left out rather than shown wrong.
//  - money  (costs, spend, revenue, ARR/MRR, CAC, LTV, salaries…): converted with the company's rate, then added.
//  - count  (customers, headcount, transactions, users, accounts…): added as they are.
// A company can override any KPI in settings.kpi_rules, e.g. { "Headcount": "sum", "NPS": "average", "Cash runway": "none" }.
export type KpiRule = 'sum' | 'money' | 'ratio' | 'average' | 'max' | 'none'
export interface KpiMember { kpis?: Record<string, number> | null; rate: number }

const RATIO = /\bper\b|\bratio\b|%|\bmargin\b|\brate\b|\baverage\b|\bavg\b|\bpayback\b|\bchurn\b|\bretention\b|\bnps\b|\barpu\b|\bconversion\b/i
const MONEY = /\bcosts?\b|\bspend\b|\brevenue\b|\barr\b|\bmrr\b|\bgmv\b|\bcac\b|\bltv\b|\bsalar(y|ies)\b|\bpayroll\b|\bamount\b|\bvalue\b|\bprice\b|\bfees?\b|\bbudget\b|[$₦£€]|\b(usd|ngn|gbp|eur|kes|ghs|zar)\b/i

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean).map((w) => w.replace(/s$/, '')).join(' ')
const r2 = (v: number) => Math.round(v * 100) / 100

export function kpiRule(name: string, rules: Record<string, KpiRule> = {}): KpiRule {
  const own = Object.entries(rules).find(([k]) => norm(k) === norm(name))?.[1]
  if (own) return own
  if (RATIO.test(name)) return 'ratio'
  if (MONEY.test(name)) return 'money'
  return 'sum'
}

// For "A per B": B is the KPI named like what follows "per" ("new paying customer" → "New paying customers");
// A is a money KPI that shares a word with what comes before "per" ("CAC" → "CAC related costs").
function ratioParts(name: string, names: string[]): [string, string] | null {
  const m = /^(.*?)\bper\b(.*)$/i.exec(name)
  if (!m) return null
  const top = norm(m[1]!), bottom = norm(m[2]!)
  if (!top || !bottom) return null
  const den = names.find((x) => x !== name && norm(x) === bottom) ?? names.find((x) => x !== name && !RATIO.test(x) && norm(x).endsWith(bottom))
  const words = top.split(' ').filter((w) => w.length > 1)
  const num = names.find((x) => x !== name && x !== den && !RATIO.test(x) && MONEY.test(x) && words.some((w) => norm(x).split(' ').includes(w)))
  return num && den ? [num, den] : null
}

export function consolidateKpis(members: KpiMember[], rules: Record<string, KpiRule> = {}): Record<string, number> {
  const names = [...new Set(members.flatMap((m) => Object.keys(m.kpis ?? {})))]
  const out: Record<string, number> = {}
  const ratios: string[] = []
  for (const name of names) {
    const rule = kpiRule(name, rules)
    const vals = members.map((m) => ({ v: m.kpis?.[name], rate: m.rate })).filter((x): x is { v: number; rate: number } => typeof x.v === 'number' && Number.isFinite(x.v))
    if (!vals.length || rule === 'none') continue
    if (rule === 'ratio') { ratios.push(name); continue }
    if (rule === 'money') out[name] = r2(vals.reduce((t, x) => t + x.v * x.rate, 0))
    else if (rule === 'sum') out[name] = r2(vals.reduce((t, x) => t + x.v, 0))
    else if (rule === 'average') out[name] = r2(vals.reduce((t, x) => t + x.v, 0) / vals.length)
    else if (rule === 'max') out[name] = Math.max(...vals.map((x) => x.v))
  }
  // Ratios last, from the group totals of their parts.
  for (const name of ratios) {
    const parts = ratioParts(name, names)
    if (!parts) continue
    const [a, b] = parts, top = out[a], bottom = out[b]
    if (typeof top === 'number' && typeof bottom === 'number' && bottom !== 0) out[name] = r2(top / bottom)
  }
  return out
}
