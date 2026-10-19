// The company's own categories (chart of accounts). A sheet row that is not a standard line maps to
// "cat:<line key>:<category name>" (or "cat::<name>" for a detail only). Categories are added into their line when the
// sheet does not give that line itself, so a sheet with its own items (Consultants, Software & Apps, Loans receivable,
// Paid-in capital…) never fails and nothing is counted twice.
export interface Cat { parent: string; name: string }
export const isCat = (to: string) => to.startsWith('cat:')
export function catOf(to: string): Cat | null {
  if (!to.startsWith('cat:')) return null
  const rest = to.slice(4), i = rest.indexOf(':'); if (i < 0) return null
  const parent = rest.slice(0, i), name = rest.slice(i + 1).trim().replace(/\s+/g, ' ').slice(0, 80)
  return name && (parent === '' || LINE_KEYS.includes(parent)) ? { parent, name } : null
}
export const catTo = (c: Cat) => 'cat:' + c.parent + ':' + c.name
export const detailKey = (c: Cat) => c.parent + '|' + c.name
const COST = ['cogs', 'opex_payroll', 'opex_marketing', 'opex_rnd', 'opex_ga', 'opex_other', 'opex_total', 'depreciation', 'interest', 'tax']
// Adds one figure for a period: standard lines and categories with the same target are added together.
export function addFigure(lines: Record<string, number>, detail: Record<string, number>, to: string, v: number) {
  const c = catOf(to)
  if (c) { const k = detailKey(c), x = COST.includes(c.parent) ? Math.abs(v) : v; detail[k] = Math.round(((detail[k] ?? 0) + x) * 100) / 100; return }
  if (!LINE_KEYS.includes(to)) return
  const x = COST.includes(to) ? Math.abs(v) : v
  lines[to] = Math.round(((lines[to] ?? 0) + x) * 100) / 100
}
// Fills each standard line from its categories. When the sheet gives the line itself too, the line is either the
// total of those categories (keep it) or one more item beside them ("Other current assets" next to "Loans receivable",
// "Property & equipment"…: add them up). The sheet's own grand total decides which (total assets, total liabilities,
// total operating costs); with no grand total, a line equal to its categories is their total, otherwise they are added.
// Lines that are totals by nature (equity, revenue, cost of sales) keep the figure given.
const GROUPS: { total: string; parts: string[] }[] = [
  { total: 'total_assets', parts: ['cash', 'receivables', 'investments', 'long_term_investments', 'other_assets'] },
  { total: 'total_liabilities', parts: ['payables', 'debt', 'other_liabilities'] },
  { total: 'opex_total', parts: ['opex_payroll', 'opex_marketing', 'opex_rnd', 'opex_ga', 'opex_other'] }]
export function foldCategories(lines: Record<string, number>, detail: Record<string, number>, given = new Set(Object.keys(lines))) {
  const sums: Record<string, number> = {}
  for (const [k, v] of Object.entries(detail)) { const p = k.slice(0, k.indexOf('|')); if (p) sums[p] = (sums[p] ?? 0) + v }
  const r2 = (v: number) => Math.round(v * 100) / 100
  const close = (a: number, b: number) => Math.abs(a - b) <= Math.max(2, Math.abs(b) * 0.005)
  for (const [p, c] of Object.entries(sums)) {
    if (!given.has(p)) { lines[p] = r2(c); continue }
    const v = lines[p]!
    if (close(v, c)) continue // the line is the total of its categories
    const grp = GROUPS.find((x) => x.parts.includes(p))
    if (!grp) continue // equity, cost of sales, revenue…: the line given is the total
    const tot = lines[grp.total]
    if (typeof tot === 'number') {
      const rest = grp.parts.filter((x) => x !== p).reduce((a, x) => a + (typeof lines[x] === 'number' ? lines[x]! : 0), 0)
      if (close(rest + v + c, tot) && !close(rest + v, tot)) lines[p] = r2(v + c)
      continue
    }
    lines[p] = r2(v + c)
  }
  return lines
}
// Keeps the categories in the chart of accounts (new ones added; a category keeps the line it was first given).
export async function ensureAccounts(cats: Cat[]) {
  const seen = new Set<string>()
  for (const c of cats) {
    const k = c.name.toLowerCase(); if (seen.has(k)) continue; seen.add(k)
    await db().query('INSERT INTO financials.accounts (name, parent) VALUES ($1, $2) ON CONFLICT (organization_id, lower(name)) DO NOTHING', [c.name, c.parent])
  }
}
export async function listAccounts(): Promise<{ id: string; name: string; parent: string }[]> {
  return (await db().query<{ id: string; name: string; parent: string }>('SELECT id, name, parent FROM financials.accounts ORDER BY parent, lower(name)').catch(() => ({ rows: [] }))).rows
}
// A sheet sync replaces the parts of a statement it gives: when it has any balance sheet line, the old balance sheet
// lines (and their categories) it no longer gives are dropped, and the same for the income statement and cash flow. So a
// row that moved to another line (e.g. strategic investments out of short-term investments) does not leave the old
// figure behind. Lines in a part the sheet does not cover, and figures typed in or uploaded (source other than sheet),
// are kept.
export function mergeStatement(old: { lines?: Record<string, number>; detail?: Record<string, number>; source?: string } | undefined, lines: Record<string, number>, detail: Record<string, number>, clear: string[] = []) {
  if (old && old.source !== 'sheet') return { lines: { ...(old.lines ?? {}), ...lines }, detail: { ...(old.detail ?? {}), ...detail } }
  const sect = new Map(LINES.map((l) => [l.key, l.section]))
  // clear: parts the sheet covers but whose figures were held back (an old reading of them is not kept either).
  const covered = new Set([...[...Object.keys(lines), ...Object.keys(detail).map((k) => k.slice(0, k.indexOf('|')))].map((k) => sect.get(k)).filter(Boolean), ...clear])
  const keep = (k: string) => !covered.has(sect.get(k)!)
  const ol = Object.fromEntries(Object.entries(old?.lines ?? {}).filter(([k]) => keep(k)))
  const od = Object.fromEntries(Object.entries(old?.detail ?? {}).filter(([k]) => { const p = k.slice(0, k.indexOf('|')); return !p || keep(p) }))
  return { lines: { ...ol, ...lines }, detail: { ...od, ...detail } }
}
