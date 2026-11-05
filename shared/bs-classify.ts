// A classified balance sheet from a company's figures: current and non-current assets and liabilities, and equity, with
// the company's own categories (detail "<line>|<name>") listed under each, the way QuickBooks and audited accounts show
// it. Standard lines say where most things go (cash, short-term investments and receivables are current; long-term
// investments are not); the categories under "other assets", "debt" and "other liabilities" are placed by their name.
//
// SAFE notes and convertible notes are equity in most management accounts (QuickBooks "VC funding") and a liability on
// a US tax return and often under US GAAP (ASC 480). The company chooses (settings.safe_treatment); the figures as
// imported are never changed, only where the line is shown, and the move is reported.
export type BsGroup = 'ca' | 'nca' | 'cl' | 'ncl' | 'eq'
export type SafeTreatment = 'equity' | 'liability' | null
export interface BsItem { key: string; label: string; group: BsGroup; value: number; moved?: boolean }
export interface BsTotals { ca: number; nca: number; ta: number; cl: number; ncl: number; tl: number; eq: number }
export interface BsClassified { items: BsItem[]; totals: BsTotals; workingCapital: number | null; currentRatio: number | null; safeMoved: number }

type L = Record<string, number | null | undefined>
const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const r2 = (v: number) => Math.round(v * 100) / 100

export const SAFE_NAME = /\bsafes?\b|simple agreement for future equity|convertible (loan )?notes?|\bconvertibles?\b|\bvc funding\b/i
// Assets that are not turned into cash within a year.
const NONCURRENT_ASSET = /propert|plant|equipment|\bppe\b|fixed asset|furniture|vehicle|computer|hardware|intangible|goodwill|licen[cs]e|software|patent|trademark|certification|right[- ]of[- ]use|deferred tax|long[- ]term|non[- ]current|notes? receivable|investment in|stake|security deposit/i
// Liabilities not due within a year.
const NONCURRENT_LIAB = /long[- ]term|non[- ]current|term loan|mortgage|lease liabilit|deferred tax|due after|debenture|bond/i

export const BS_LABEL: Record<string, string> = {
  cash: 'Cash and cash equivalents', investments: 'Short-term investments', receivables: 'Receivables', long_term_investments: 'Long-term investments',
  other_assets: 'Other assets', payables: 'Payables', debt: 'Borrowings', other_liabilities: 'Other liabilities', equity: "Shareholders' equity" }
const ASSET_LINES: [string, BsGroup][] = [['cash', 'ca'], ['investments', 'ca'], ['receivables', 'ca'], ['other_assets', 'ca'], ['long_term_investments', 'nca']]
const LIAB_LINES = ['payables', 'debt', 'other_liabilities']

function placeAsset(line: string, name: string, fallback: BsGroup): BsGroup {
  if (line === 'long_term_investments') return 'nca'
  if (line === 'cash' || line === 'investments' || line === 'receivables') return 'ca'
  return NONCURRENT_ASSET.test(name) ? 'nca' : fallback
}
const placeLiab = (name: string): BsGroup => (NONCURRENT_LIAB.test(name) ? 'ncl' : 'cl')

// `lines` are the figures as saved (cash is the bank balance; treasury bills are short-term investments).
export function classifyBalance(lines: L, detail: Record<string, number> | null | undefined, o: { safe?: SafeTreatment } = {}): BsClassified {
  const det = detail ?? {}
  const items: BsItem[] = []
  const cats = (line: string) => Object.entries(det).filter(([k, v]) => k.startsWith(line + '|') && n(v) !== null && v !== 0).map(([k, v]) => ({ key: k, name: k.slice(line.length + 1), value: v as number }))
  const push = (key: string, label: string, group: BsGroup, value: number | null) => { if (value !== null && Math.abs(value) >= 0.5) items.push({ key, label, group, value: r2(value) }) }
  // One line: its categories, then whatever of the line they do not explain.
  const line = (k: string, place: (name: string) => BsGroup, restGroup: BsGroup, given: number | null) => {
    const cs = cats(k)
    for (const c of cs) push(c.key, c.name, place(c.name), c.value)
    const sum = cs.reduce((a, c) => a + c.value, 0)
    const v = given
    if (v !== null && (!cs.length || Math.abs(v - sum) >= 1)) push(k, cs.length ? (BS_LABEL[k]!.startsWith('Other') ? BS_LABEL[k]! : 'Other ' + BS_LABEL[k]!.toLowerCase()) : BS_LABEL[k]!, restGroup, cs.length ? v - sum : v)
  }
  for (const [k, g] of ASSET_LINES) {
    const given = n(lines[k])
    // "Other assets" not itemised are long-lived more often than not (QuickBooks "Other assets").
    line(k, (nm) => placeAsset(k, nm, 'ca'), k === 'other_assets' ? 'nca' : g, given)
  }
  for (const k of LIAB_LINES) line(k, placeLiab, 'cl', n(lines[k]))
  line('equity', () => 'eq', 'eq', n(lines.equity))

  // What the totals have that the lines do not itemise.
  const sumG = (gs: BsGroup[]) => items.filter((i) => gs.includes(i.group)).reduce((a, i) => a + i.value, 0)
  const ta = n(lines.total_assets), tl = n(lines.total_liabilities)
  if (ta !== null && Math.abs(ta - sumG(['ca', 'nca'])) >= 1) push('other_assets|*', 'Other assets (not itemised in the figures)', 'nca', ta - sumG(['ca', 'nca']))
  if (tl !== null && Math.abs(tl - sumG(['cl', 'ncl'])) >= 1) push('other_liabilities|*', 'Other liabilities (not itemised in the figures)', 'cl', tl - sumG(['cl', 'ncl']))
  const eqGiven = n(lines.equity)
  if (eqGiven === null && !items.some((i) => i.group === 'eq') && ta !== null && tl !== null) push('equity', BS_LABEL.equity!, 'eq', ta - tl)

  // SAFEs and convertible notes where the company wants them.
  let safeMoved = 0
  for (const i of items) {
    if (!SAFE_NAME.test(i.label)) continue
    if (o.safe === 'equity' && (i.group === 'cl' || i.group === 'ncl')) { i.group = 'eq'; i.moved = true; safeMoved += i.value }
    else if (o.safe === 'liability' && i.group === 'eq') { i.group = 'ncl'; i.moved = true; safeMoved -= i.value }
  }
  const t: BsTotals = { ca: sumG(['ca']), nca: sumG(['nca']), ta: 0, cl: sumG(['cl']), ncl: sumG(['ncl']), tl: 0, eq: sumG(['eq']) }
  t.ta = t.ca + t.nca; t.tl = t.cl + t.ncl
  for (const k of Object.keys(t) as (keyof BsTotals)[]) t[k] = r2(t[k])
  const hasCur = items.some((i) => i.group === 'cl')
  return { items, totals: t, workingCapital: items.length ? r2(t.ca - t.cl) : null, currentRatio: hasCur && t.cl > 0 ? Math.round((t.ca / t.cl) * 100) / 100 : null, safeMoved: r2(safeMoved) }
}

// The classified balance sheet for several periods side by side, ready for a table: headings, each item in the order
// it first appears, subtotals and totals. Items a period does not have are empty for that period.
export interface BsRow { label: string; kind: 'head' | 'item' | 'total' | 'grand' | 'ratio'; values: (number | null)[]; key?: string; moved?: boolean }
const GROUPS: { g: BsGroup; head: string; total: string }[] = [
  { g: 'ca', head: 'Current assets', total: 'Total current assets' }, { g: 'nca', head: 'Non-current assets', total: 'Total non-current assets' },
  { g: 'cl', head: 'Current liabilities', total: 'Total current liabilities' }, { g: 'ncl', head: 'Non-current liabilities', total: 'Total non-current liabilities' },
  { g: 'eq', head: "Shareholders' equity", total: "Total shareholders' equity" }]
export function classifiedRows(periods: BsClassified[]): { rows: BsRow[]; moved: number[] } {
  const rows: BsRow[] = []
  const any = (vals: (number | null)[]) => vals.some((v) => v !== null && Math.abs(v) >= 0.5)
  const tot = (k: keyof BsTotals) => periods.map((p) => (p.items.length ? p.totals[k] : null))
  for (const { g, head, total } of GROUPS) {
    const keys: { key: string; label: string; moved: boolean }[] = []
    // No marker on moved lines: reports give the figures as presented, without explaining the setting.
    for (const p of periods) for (const i of p.items) if (i.group === g && !keys.some((x) => x.key === i.key)) keys.push({ key: i.key, label: i.label, moved: false })
    const lines = keys.map((x) => ({ label: x.label, key: x.key, moved: x.moved, kind: 'item' as const, values: periods.map((p) => p.items.find((i) => i.key === x.key && i.group === g)?.value ?? null) })).filter((r) => any(r.values))
    if (lines.length) { rows.push({ label: head, kind: 'head', values: periods.map(() => null) }, ...lines, { label: total, kind: 'total', values: tot(g) }) }
    if (g === 'nca' && periods.some((p) => p.items.some((i) => i.group === 'ca' || i.group === 'nca'))) rows.push({ label: 'Total assets', kind: 'grand', values: tot('ta') })
    if (g === 'ncl' && periods.some((p) => p.items.some((i) => i.group === 'cl' || i.group === 'ncl'))) rows.push({ label: 'Total liabilities', kind: 'total', values: tot('tl') })
  }
  if (rows.length) rows.push({ label: 'Total liabilities and equity', kind: 'grand', values: periods.map((p) => (p.items.length ? Math.round((p.totals.tl + p.totals.eq) * 100) / 100 : null)) })
  const wc = periods.map((p) => p.workingCapital), cr = periods.map((p) => p.currentRatio)
  if (any(wc)) rows.push({ label: 'Working capital (current assets less current liabilities)', kind: 'ratio', values: wc })
  if (cr.some((v) => v !== null)) rows.push({ label: 'Current ratio', kind: 'ratio', key: 'current_ratio', values: cr })
  return { rows, moved: periods.map((p) => p.safeMoved) }
}

// The note to print under a balance sheet when SAFEs were moved for presentation.
// Not printed any more (the founder asked for the figures as presented, with no explanation of the setting); kept so
// callers stay simple.
export function safeNote(moved: number[], t: SafeTreatment, fmt: (v: number) => string): string | null {
  if (moved.length >= 0) return null
  const m = moved.find((x) => Math.abs(x) >= 1)
  if (m === undefined || !t) return null
  return t === 'equity'
    ? 'SAFE and convertible notes (' + fmt(Math.abs(m)) + ') are shown in equity, as chosen in settings: they convert into shares and are not repaid in cash. Under US GAAP (ASC 480) and on a US tax return they are often a liability.'
    : 'SAFE and convertible notes (' + fmt(Math.abs(m)) + ') are shown as a non-current liability, as chosen in settings (US GAAP, ASC 480).'
}

// Categories for a period that ends on `end`. A month or year saved as such has its own; a quarter or a year still
// running (it "ends" in December) takes the balance sheet categories of its latest month at or before `end`, and the
// profit and loss categories added up over its months (`from` is the first month's end).
const BS_KEYS = new Set(['cash', 'investments', 'receivables', 'long_term_investments', 'other_assets', 'total_assets', 'payables', 'debt', 'other_liabilities', 'total_liabilities', 'equity'])
type DRow = { period_type: string; period_end: string; detail?: Record<string, number> | null }
export function periodDetail(rows: DRow[], end: string, from?: string): Record<string, number> | null {
  const yearAgo = String(Number(end.slice(0, 4)) - 1) + end.slice(4)
  const ms = rows.filter((r) => r.period_type === 'month' && r.period_end <= end && r.period_end > (from ? from.slice(0, 7) + '-00' : yearAgo)).sort((a, b) => a.period_end.localeCompare(b.period_end))
  if (!ms.length) return null
  const last = ms[ms.length - 1]!, out: Record<string, number> = {}
  for (const [k, v] of Object.entries(last.detail ?? {})) if (BS_KEYS.has(k.split('|')[0]!) && typeof v === 'number') out[k] = v
  if (from) for (const m of ms) for (const [k, v] of Object.entries(m.detail ?? {})) if (!BS_KEYS.has(k.split('|')[0]!) && typeof v === 'number') out[k] = Math.round(((out[k] ?? 0) + v) * 100) / 100
  return Object.keys(out).length ? out : null
}
