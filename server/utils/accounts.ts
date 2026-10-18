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
// Fills each standard line its categories belong to, when the sheet did not give the line itself.
export function foldCategories(lines: Record<string, number>, detail: Record<string, number>, given = new Set(Object.keys(lines))) {
  const sums: Record<string, number> = {}
  for (const [k, v] of Object.entries(detail)) { const p = k.slice(0, k.indexOf('|')); if (p) sums[p] = (sums[p] ?? 0) + v }
  for (const [p, v] of Object.entries(sums)) if (!given.has(p)) lines[p] = Math.round(v * 100) / 100
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
