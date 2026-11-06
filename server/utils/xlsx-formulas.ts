// Live Excel formulas for report workbooks, so a reader can click a total, a margin or a change and see how it is
// worked out. The figures are written first; then each total is matched against the lines around it and, only when
// the arithmetic agrees in every column, its value is replaced by the formula (with the result cached so the file
// shows numbers before Excel recalculates). Nothing is guessed: a row that no simple sum or difference explains keeps
// its number. A "How the numbers are worked out" sheet explains the measures that are not simple sums.
import type { Workbook, Worksheet, Cell } from 'exceljs'

export interface XRow { n: number; kind?: string; label: string }
export interface XBlock { rows: XRow[]; cols: number[]; changes?: { col: number; cur: number; other: number }[]; shares?: { col: number; of: number } }

const L = (c: number) => { let s = ''; for (let n = c; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s }
const ref = (col: number, row: number) => L(col) + row
// A cell as a number: plain numbers, "1,234", "(1,234)", "−5%" (as 0.05); text such as "–" or "over 24 months" is none.
function val(c: Cell): { v: number | null; pct: boolean } {
  const x = c.value as unknown
  if (typeof x === 'number') return { v: x, pct: c.numFmt?.includes('%') ?? false }
  if (x && typeof x === 'object' && 'result' in (x as object)) { const r = (x as { result: unknown }).result; return { v: typeof r === 'number' ? r : null, pct: c.numFmt?.includes('%') ?? false } }
  if (typeof x !== 'string') return { v: null, pct: false }
  const t = x.replace(/[−–]/g, '-').replace(/,/g, '').trim()
  let m = /^\+?(-?\d+(\.\d+)?)%$/.exec(t); if (m) return { v: Number(m[1]) / 100, pct: true }
  m = /^\((\d+(\.\d+)?)\)$/.exec(t); if (m) return { v: -Number(m[1]), pct: false }
  return /^-?\d+(\.\d+)?$/.test(t) ? { v: Number(t), pct: false } : { v: null, pct: false }
}
const TARGET = /gross profit|ebitda|operating (income|loss|profit)|net (income|loss|cash|change|increase|decrease|movement)|profit|^total|total |working capital|cash at (the )?end|closing|end of (the )?(period|year|quarter|month)/i
const MARGIN = /margin/i

export function liveFormulas(ws: Worksheet, b: XBlock): number {
  const rows = b.rows, done = new Set<number>()
  let count = 0
  // Matching uses each cell's original figure (a total already turned into a formula keeps its own rounding out of the
  // match); the cached results use what the formulas give, so they agree with Excel's own recalculation.
  const orig = new Map<string, { v: number | null; pct: boolean }>()
  const get = (n: number, col: number) => orig.get(ref(col, n)) ?? val(ws.getCell(ref(col, n)))
  const now = (n: number, col: number) => val(ws.getCell(ref(col, n)))
  const tol = (k: number) => Math.max(1.01, 0.51 * k)
  const set = (n: number, col: number, formula: string, result: number, fmt?: string) => {
    const c = ws.getCell(ref(col, n)); if (!orig.has(ref(col, n))) orig.set(ref(col, n), val(c)); const font = c.font, align = c.alignment, old = c.numFmt
    c.value = { formula, result } as never; c.numFmt = fmt ?? old; c.font = font; c.alignment = align ?? { horizontal: 'right' }
  }
  // Does target = Σ sign·operand in every column with a figure?
  const fits = (t: XRow, ops: [XRow, number][]) => {
    let seen = 0
    for (const col of b.cols) {
      const tv = get(t.n, col); if (tv.v === null || tv.pct) continue
      const vs = ops.map(([o]) => get(o.n, col))
      if (vs.some((x) => x.pct)) return false
      if (vs.every((x) => x.v === null)) { if (Math.abs(tv.v) > 0.5) return false; continue }
      const s = ops.reduce((a, [, sg], i) => a + sg * (vs[i]!.v ?? 0), 0)
      if (Math.abs(s - tv.v) > tol(ops.length)) return false
      if (Math.abs(tv.v) > 0.5) seen++
    }
    return seen >= 1
  }
  const write = (t: XRow, ops: [XRow, number][], contiguous: boolean) => {
    for (const col of b.cols) {
      const tv = get(t.n, col); if (tv.v === null || tv.pct) continue
      const s = ops.reduce((a, [o, sg]) => a + sg * (now(o.n, col).v ?? 0), 0)
      const f = contiguous && ops.every(([, sg]) => sg === 1) ? 'SUM(' + ref(col, ops[0]![0].n) + ':' + ref(col, ops[ops.length - 1]![0].n) + ')'
        : ops.map(([o, sg], i) => (sg < 0 ? '-' : i ? '+' : '') + 'N(' + ref(col, o.n) + ')').join('')
      set(t.n, col, f, Math.round(s * 100) / 100)
    }
    done.add(t.n); count++
  }
  const isNum = (r: XRow) => b.cols.some((col) => { const x = get(r.n, col); return x.v !== null && !x.pct })
  rows.forEach((t, i) => {
    if (t.kind === 'sub' || t.kind === 'head' || !isNum(t)) return
    if (!(t.kind === 'total' || t.kind === 'grand' || TARGET.test(t.label))) return
    const plus = (xs: XRow[]) => xs.map((x) => [x, 1] as [XRow, number])
    // The lines since the last total or heading, the sub-lines just above, or the sub-lines just below (a parent line).
    const above: XRow[] = []; for (let j = i - 1; j >= 0 && !['total', 'grand', 'head'].includes(rows[j]!.kind ?? '') && !MARGIN.test(rows[j]!.label); j--) if (isNum(rows[j]!)) above.unshift(rows[j]!)
    const subsUp: XRow[] = []; for (let j = i - 1; j >= 0 && rows[j]!.kind === 'sub'; j--) subsUp.unshift(rows[j]!)
    const subsDown: XRow[] = []; for (let j = i + 1; j < rows.length && rows[j]!.kind === 'sub'; j++) subsDown.push(rows[j]!)
    for (const g of [above, subsUp, subsDown]) if (g.length >= 2 && fits(t, plus(g))) return write(t, plus(g), true)
    // A sum or difference of earlier main lines (gross profit = revenue - cost of sales, EBITDA = gross profit - costs, …).
    const prev = rows.slice(0, i).filter((r) => r.kind !== 'sub' && r.kind !== 'head' && !MARGIN.test(r.label) && isNum(r)).reverse().slice(0, 14)
    // Of the sums that fit, the one whose lines share the most words with the total ("Total liabilities and equity" is
    // liabilities plus equity, not current plus non-current assets, though both add up), then the nearest.
    const words = (l: string) => l.toLowerCase().replace(/[^a-z ]/g, ' ').split(/\s+/).filter((w) => w.length >= 4 && !['total', 'less', 'from', 'before', 'after', 'with'].includes(w))
    const tw = words(t.label), score = (ops: [XRow, number][]) => ops.reduce((a, [o]) => a + words(o.label).filter((w) => tw.includes(w)).length, 0)
    let best: { ops: [XRow, number][]; sc: number } | null = null
    const consider = (ops: [XRow, number][]) => { if (!fits(t, ops)) return; const sc = score(ops); if (!best || sc > best.sc) best = { ops, sc } }
    for (let x = 0; x < prev.length; x++) for (let y = 0; y < prev.length; y++) {
      if (x === y) continue
      for (const sg of [-1, 1]) { if (sg === 1 && y < x) continue; const ops: [XRow, number][] = ([[prev[x]!, 1], [prev[y]!, sg]] as [XRow, number][]).sort((p, q) => p[0].n - q[0].n); if (ops[0]![1] < 0) continue; consider(ops) }
    }
    if (!best) for (let x = 0; x < prev.length; x++) for (let y = 0; y < prev.length; y++) for (let z = 0; z < prev.length; z++) {
      if (x === y || y === z || x === z || y > z) continue
      for (const s1 of [-1, 1]) for (const s2 of [-1, 1]) consider(([[prev[x]!, 1], [prev[y]!, s1], [prev[z]!, s2]] as [XRow, number][]).sort((p, q) => (q[1] - p[1]) || (p[0].n - q[0].n)))
    }
    const pick = best as { ops: [XRow, number][] } | null
    if (pick) write(t, pick.ops, false)
  })
  // Margins: a line divided by revenue (the first line with figures, or one called revenue or sales).
  const base = rows.find((r) => /revenue|sales|turnover/i.test(r.label) && r.kind !== 'sub' && isNum(r)) ?? rows.find(isNum)
  for (const t of rows) {
    if (!MARGIN.test(t.label) || !base) continue
    const cand = rows.filter((r) => r.n < t.n && r !== base && r.kind !== 'sub' && isNum(r)).reverse()
    for (const a of cand) {
      let ok = 0, bad = false
      for (const col of b.cols) { const tv = get(t.n, col), av = get(a.n, col).v, bv = get(base.n, col).v; if (tv.v === null) continue; if (av === null || !bv) { bad = true; break } const q = av / bv; if (Math.abs(q - (tv.pct ? tv.v : tv.v / 100)) > 0.0006 && Math.abs(q - tv.v) > 0.0006) { bad = true; break } ok++ }
      if (bad || !ok) continue
      for (const col of b.cols) { const tv = get(t.n, col); if (tv.v === null) continue; const av = now(a.n, col).v ?? 0, bv = now(base.n, col).v ?? 0; set(t.n, col, 'IFERROR(N(' + ref(col, a.n) + ')/N(' + ref(col, base.n) + '),"")', bv ? av / bv : 0, '0.0%') }
      count++; break
    }
  }
  // Change columns: this period less the other one, as an amount or a percentage of the other.
  for (const ch of b.changes ?? []) for (const t of rows) {
    const cv = get(t.n, ch.col), a = get(t.n, ch.cur), o = get(t.n, ch.other)
    if (cv.v === null || a.v === null || o.v === null || a.pct || o.pct) continue
    if (cv.pct) { if (!o.v) continue; const q = (a.v - o.v) / Math.abs(o.v); if (Math.abs(q - cv.v) > 0.0006 && Math.abs(Math.abs(q) - Math.abs(cv.v)) > 0.0006) continue; const na = now(t.n, ch.cur).v ?? 0, no = now(t.n, ch.other).v ?? 0; set(t.n, ch.col, 'IFERROR((N(' + ref(ch.cur, t.n) + ')-N(' + ref(ch.other, t.n) + '))/ABS(N(' + ref(ch.other, t.n) + ')),"")', no ? (na - no) / Math.abs(no) : 0, '+0.0%;-0.0%;0.0%'); count++ }
    else if (Math.abs(a.v - o.v - cv.v) <= 1.01) { set(t.n, ch.col, 'N(' + ref(ch.cur, t.n) + ')-N(' + ref(ch.other, t.n) + ')', (now(t.n, ch.cur).v ?? 0) - (now(t.n, ch.other).v ?? 0)); count++ }
  }
  // Shares of a total (pie tables).
  if (b.shares && rows.length > 1) {
    const r0 = rows[0]!.n, r1 = rows[rows.length - 1]!.n
    for (const t of rows) { const a = get(t.n, b.shares.of).v; if (a === null) continue; const tot = rows.reduce((s, r) => s + (get(r.n, b.shares!.of).v ?? 0), 0); set(t.n, b.shares.col, 'IFERROR(' + ref(b.shares.of, t.n) + '/SUM(' + L(b.shares.of) + '$' + r0 + ':' + L(b.shares.of) + '$' + r1 + '),"")', tot ? a / tot : 0, '0.0%') }
    count++
  }
  return count
}

// The measures that are not a plain sum, in words. Only those the workbook uses are listed.
const HOW: [RegExp, string, string][] = [
  [/gross profit/i, 'Gross profit', 'Revenue less cost of sales (cost of revenue).'],
  [/gross margin/i, 'Gross margin', 'Gross profit divided by revenue.'],
  [/ebitda/i, 'EBITDA', 'Gross profit less running (operating) costs, before depreciation, amortisation, interest and tax.'],
  [/net income|net loss|net profit/i, 'Net income', 'EBITDA less depreciation, interest and tax, plus other income.'],
  [/working capital/i, 'Working capital', 'Current assets less current liabilities.'],
  [/current ratio/i, 'Current ratio', 'Current assets divided by current liabilities.'],
  [/burn/i, 'Monthly burn', 'Cash used by operations and investing, averaged over the last 3 months (treasury bills and other securities count as cash). Zero when the company is generating cash.'],
  [/runway/i, 'Runway', 'Cash and securities divided by monthly burn.'],
  [/last 12 months|ttm/i, 'Last 12 months', 'The 12 months up to the end of the period, added up.'],
  [/\barr\b/i, 'ARR', 'Annual recurring revenue: the latest month\'s revenue times 12.'],
  [/net revenue retention|\bnrr\b/i, 'Net revenue retention', 'Revenue in the last 12 months from customers who paid in the 12 months before, divided by what those customers paid then. Includes expansion.'],
  [/gross revenue retention|\bgrr\b/i, 'Gross revenue retention', 'As net revenue retention, but each customer counts at most what they paid before, so expansion is left out.'],
  [/revenue churn|churn/i, 'Revenue churn', 'Revenue from last year\'s customers who stopped paying, as a share of last year\'s revenue.'],
  [/lifetime value|\bltv\b/i, 'Lifetime value', 'Average revenue a customer pays a month, times gross margin, times the expected months a customer stays.'],
  [/average customer pays|arpa|revenue per customer/i, 'Average revenue per customer', 'Revenue in the period divided by customers who paid in it, per month.'],
  [/change/i, 'Change', 'This period less the period compared, as an amount, or as a percentage of the period compared.'],
  [/year to date/i, 'Year to date', 'From the first month of the financial year to the end of the period, added up.'],
  [/\bshare\b/i, 'Share', 'Each amount divided by the total of the table.'],
]
export function howSheet(wb: Workbook, o: { font: { name: string; size: number }; navy: string; mut: string; title?: string; formulas: number }) {
  const words: string[] = []
  wb.eachSheet((ws) => ws.eachRow((row) => row.eachCell((c) => { if (typeof c.value === 'string') words.push(c.value) })))
  const all = words.join(' \n ')
  const items = HOW.filter(([re]) => re.test(all))
  const ws = wb.addWorksheet('How the numbers work', { views: [{ showGridLines: false }] })
  ws.getColumn(1).width = 3; ws.getColumn(2).width = 30; ws.getColumn(3).width = 90
  ws.getCell('B1').value = (o.title ?? '').toUpperCase(); ws.getCell('B1').font = { ...o.font, bold: true, color: { argb: o.navy } }
  ws.getCell('B3').value = 'HOW THE NUMBERS ARE WORKED OUT'; ws.getCell('B3').font = { ...o.font, bold: true, size: 13, color: { argb: o.navy } }
  ws.addRow([])
  const note = ws.addRow(['', o.formulas ? 'Totals, margins, changes and shares in the tables are live Excel formulas: select a cell to see how it is added up from the lines above it. Each line is rounded to a whole number first, so a total can differ by 1 from the PDF.' : 'The figures in this workbook are values; the measures below explain how they are worked out.'])
  ws.mergeCells(note.number, 2, note.number, 3); note.getCell(2).alignment = { wrapText: true, vertical: 'top' }; note.getCell(2).font = { ...o.font, color: { argb: o.mut } }; note.height = 32
  ws.addRow([])
  for (const [, k, v] of items) { const r = ws.addRow(['', k, v]); r.getCell(2).font = { ...o.font, bold: true }; r.getCell(3).font = o.font; r.getCell(3).alignment = { wrapText: true, vertical: 'top' }; r.height = Math.max(16, 15 * Math.ceil(v.length / 95)) }
}
