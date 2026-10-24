// Turning bank statement files into transactions. CSV is parsed directly; PDF is read by the AI.
// Whatever the source, a statement is only saved if opening + money in - money out = closing.
import { z } from 'zod'

export interface ParsedTxn { date: string; description: string; amount: number; balance: number | null }
export interface ParsedStatement { period_start: string | null; period_end: string | null; opening: number | null; closing: number | null; txns: ParsedTxn[]; notes: string }

// ── CSV
export function parseCsvRows(text: string): string[][] { return csvRows(text) }
function csvRows(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++ } else q = false } else cell += c }
    else if (c === '"') q = true
    else if (c === ',' || c === ';' || c === '\t') { row.push(cell.trim()); cell = '' }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell.trim()); if (row.some((x) => x !== '')) rows.push(row); row = []; cell = '' }
    else cell += c
  }
  row.push(cell.trim()); if (row.some((x) => x !== '')) rows.push(row)
  return rows
}
export function parseAmount(s: string | undefined): number | null {
  if (s === undefined) return null
  let t = s.replace(/[\s,₦$£€]|NGN|USD|GBP|EUR/gi, '')
  if (!t) return null
  let sign = 1
  if (/^\(.*\)$/.test(t)) { sign = -1; t = t.slice(1, -1) }
  if (/DR$/i.test(t)) { sign = -1; t = t.slice(0, -2) } else if (/CR$/i.test(t)) t = t.slice(0, -2)
  if (t.startsWith('-')) { sign *= -1; t = t.slice(1) }
  if (!/^\d+(\.\d+)?$/.test(t)) return null
  return Math.round(sign * Number(t) * 100) / 100
}
const MON: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 }
function iso(y: number, m: number, d: number): string | null {
  if (y < 100) y += 2000
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? dt.toISOString().slice(0, 10) : null
}
// order: 'dmy' or 'mdy' for ambiguous numeric dates
export function parseDate(s: string, order: 'dmy' | 'mdy'): string | null {
  const t = s.trim()
  let m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/); if (m) return iso(+m[1]!, +m[2]!, +m[3]!)
  m = t.match(/^(\d{1,2})[-/. ]([A-Za-z]{3})[A-Za-z]*[-/. ,]+(\d{2,4})/); if (m && MON[m[2]!.toLowerCase()]) return iso(+m[3]!, MON[m[2]!.toLowerCase()]!, +m[1]!)
  m = t.match(/^([A-Za-z]{3})[A-Za-z]* (\d{1,2}),? (\d{4})/); if (m && MON[m[1]!.toLowerCase()]) return iso(+m[3]!, MON[m[1]!.toLowerCase()]!, +m[2]!)
  m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/)
  if (m) { const a = +m[1]!, b = +m[2]!, y = +m[3]!; return order === 'dmy' ? iso(y, b, a) : iso(y, a, b) }
  return null
}
const H = {
  date: /^(transaction |trans\.? |txn |value |posting |book(ing)? )?date$|^date$/i,
  desc: /description|narration|details|memo|particulars|payee|reference|remarks/i,
  amount: /^(amount|amt|transaction amount|value)$/i,
  debit: /debit|withdrawal|paid out|money out|dr\b/i,
  credit: /credit|deposit|paid in|money in|lodgement|cr\b/i,
  balance: /balance/i
}
export function parseCsv(text: string, currency: string): ParsedStatement { return parseRows(csvRows(text), currency) }
// The columns of a statement laid out as a table: found by their headings, or (for any other layout) given by the AI's
// reading of the first rows (StmtMap).
export interface StmtMap { header_row: number; date: number; description: number[]; amount: number | null; debit: number | null; credit: number | null; direction: number | null; out_words: string[]; balance: number | null; date_order: 'dmy' | 'mdy' | null }
export function parseRows(rows: string[][], currency: string, map?: StmtMap): ParsedStatement {
  if (map) return parseWithMap(rows, currency, map)
  const hi = rows.findIndex((r) => r.some((c) => H.date.test(c)) && (r.some((c) => H.amount.test(c)) || (r.some((c) => H.debit.test(c)) && r.some((c) => H.credit.test(c)))))
  if (hi < 0) throw new Error('header')
  const head = rows[hi]!
  const col = (re: RegExp, not?: RegExp) => head.findIndex((c) => re.test(c) && !(not && not.test(c)))
  const ci = { date: col(H.date), desc: col(H.desc), amount: col(H.amount), debit: col(H.debit, H.balance), credit: col(H.credit, H.balance), balance: col(H.balance) }
  // Example rows from Finvry's template ("delete this row") are skipped if left in.
  const body = rows.slice(hi + 1).filter((r) => r[ci.date] && !r.some((c) => /\(delete this row\)/i.test(c)))
  // Decide day/month order from the data itself, then the currency
  let order: 'dmy' | 'mdy' = ['USD'].includes(currency) ? 'mdy' : 'dmy'
  for (const r of body) { const m = r[ci.date]!.match(/^(\d{1,2})[-/.](\d{1,2})[-/.]/); if (m) { if (+m[1]! > 12) { order = 'dmy'; break } if (+m[2]! > 12) { order = 'mdy'; break } } }
  const txns: ParsedTxn[] = []
  for (const r of body) {
    const date = parseDate(r[ci.date]!, order)
    if (!date) continue
    let amount: number | null
    if (ci.amount >= 0) amount = parseAmount(r[ci.amount])
    else { const cr = parseAmount(r[ci.credit]) ?? 0, dr = parseAmount(r[ci.debit]) ?? 0; amount = Math.round((Math.abs(cr) - Math.abs(dr)) * 100) / 100; if (!r[ci.credit] && !r[ci.debit]) amount = null }
    if (amount === null) continue
    txns.push({ date, description: (ci.desc >= 0 ? r[ci.desc] : '')!.slice(0, 500) || '—', amount, balance: ci.balance >= 0 ? parseAmount(r[ci.balance]) : null })
  }
  if (!txns.length) throw new Error('empty')
  // Statements list newest first or oldest first; put them oldest first
  if (txns.length > 1 && txns[0]!.date > txns[txns.length - 1]!.date) txns.reverse()
  const first = txns[0]!, last = txns[txns.length - 1]!
  const opening = first.balance !== null ? Math.round((first.balance - first.amount) * 100) / 100 : null
  return { period_start: first.date, period_end: last.date, opening, closing: last.balance, txns, notes: 'Read from CSV columns: ' + [ci.date, ci.desc, ci.amount, ci.debit, ci.credit, ci.balance].map((i) => (i >= 0 ? head[i] : '')).filter(Boolean).join(', ') }
}

function finish(txns: ParsedTxn[], notes: string): ParsedStatement {
  if (!txns.length) throw new Error('empty')
  if (txns.length > 1 && txns[0]!.date > txns[txns.length - 1]!.date) txns.reverse()
  const first = txns[0]!, last = txns[txns.length - 1]!
  const opening = first.balance !== null ? Math.round((first.balance - first.amount) * 100) / 100 : null
  return { period_start: first.date, period_end: last.date, opening, closing: last.balance, txns, notes }
}
// Excel date serials (e.g. 46000) as well as written dates.
const dateOfCell = (s: string, order: 'dmy' | 'mdy') => { const n = Number(s); if (/^\d{5}(\.\d+)?$/.test(s.trim()) && n > 30000 && n < 80000) return new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000).toISOString().slice(0, 10); return parseDate(s, order) }
function parseWithMap(rows: string[][], currency: string, m: StmtMap): ParsedStatement {
  const body = rows.slice(m.header_row + 1).filter((r) => r[m.date] && !r.some((c) => /\(delete this row\)/i.test(c)))
  let order: 'dmy' | 'mdy' = m.date_order ?? (currency === 'USD' ? 'mdy' : 'dmy')
  if (!m.date_order) for (const r of body) { const x = r[m.date]!.match(/^(\d{1,2})[-/.](\d{1,2})[-/.]/); if (x) { if (+x[1]! > 12) { order = 'dmy'; break } if (+x[2]! > 12) { order = 'mdy'; break } } }
  const outW = m.out_words.map((w) => w.toLowerCase().trim()).filter(Boolean)
  const txns: ParsedTxn[] = []
  for (const r of body) {
    const date = dateOfCell(r[m.date]!, order); if (!date) continue
    let amount: number | null = null
    if (m.amount !== null) {
      amount = parseAmount(r[m.amount])
      // A separate "type" column (DR / CR, Debit / Credit, Withdrawal / Deposit) says which way the money went.
      if (amount !== null && m.direction !== null) { const d = (r[m.direction] ?? '').toLowerCase().trim(); amount = Math.abs(amount) * (outW.some((w) => d === w || d.startsWith(w)) ? -1 : 1) }
    } else {
      const cr = m.credit !== null ? parseAmount(r[m.credit]) : null, dr = m.debit !== null ? parseAmount(r[m.debit]) : null
      if (cr === null && dr === null) continue
      amount = Math.round((Math.abs(cr ?? 0) - Math.abs(dr ?? 0)) * 100) / 100
    }
    if (!amount) continue
    const desc = m.description.map((i) => r[i] ?? '').filter(Boolean).join(' · ').slice(0, 500) || '—'
    txns.push({ date, description: desc, amount, balance: m.balance !== null ? parseAmount(r[m.balance]) : null })
  }
  return finish(txns, 'Columns read with AI from the statement\'s own layout')
}
const MAP_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['header_row', 'date', 'description', 'amount', 'debit', 'credit', 'direction', 'out_words', 'balance', 'date_order'],
  properties: {
    header_row: { type: 'integer', description: 'Row number (as numbered) of the column headings; the transactions start on the next row' },
    date: { type: 'integer', description: 'Column number of the transaction (or posting) date' },
    description: { type: 'array', items: { type: 'integer' }, description: 'Column numbers that describe the transaction (narration, details, reference, payee), most useful first' },
    amount: { type: ['integer', 'null'], description: 'A single amount column, if money in and out share one column; else null' },
    debit: { type: ['integer', 'null'], description: 'Money out column (debits, withdrawals), if separate; else null' },
    credit: { type: ['integer', 'null'], description: 'Money in column (credits, deposits, lodgements), if separate; else null' },
    direction: { type: ['integer', 'null'], description: 'A column saying whether each amount is in or out (DR/CR, Debit/Credit, D/C), used with a single amount column; else null' },
    out_words: { type: 'array', items: { type: 'string' }, description: 'The values in the direction column that mean money out (e.g. ["DR", "D", "Debit"]); empty if no such column' },
    balance: { type: ['integer', 'null'], description: 'Running balance column, if any; else null' },
    date_order: { type: ['string', 'null'], enum: ['dmy', 'mdy', null], description: 'For dates like 03/04/2026: dmy (day first) or mdy (month first); null if dates are unambiguous' }
  }
}
const MapZ = z.object({ header_row: z.number().int().min(0), date: z.number().int().min(0), description: z.array(z.number().int().min(0)).max(4), amount: z.number().int().min(0).nullable(), debit: z.number().int().min(0).nullable(), credit: z.number().int().min(0).nullable(), direction: z.number().int().min(0).nullable(), out_words: z.array(z.string().max(20)).max(8), balance: z.number().int().min(0).nullable(), date_order: z.enum(['dmy', 'mdy']).nullable() })
// Any other statement layout (bank exports with title rows, merged headings, a type column, separate date and time,
// odd names): the AI reads the first rows and says which column is which. The figures themselves are then read by
// the rules above, so every amount is copied exactly, never by the AI.
export async function aiStatementMap(rows: string[][], inputRef: string): Promise<StmtMap> {
  const show = (from: number, to: number) => rows.slice(from, to).map((r, k) => 'Row ' + (from + k) + ': ' + r.map((c, i) => '[' + i + '] ' + String(c).slice(0, 40)).join(' | ')).join('\n')
  const { output } = await runAiTool<StmtMap>({
    task: 'bank_statement_map', model: useRuntimeConfig().aiModelPitchScreen, promptVersion: 'bank-map-v1', inputRef, maxTokens: 800,
    system: 'You read the layout of bank statement exports (CSV or Excel). Find the row with the column headings and say which column holds the date, the description, the amounts (one signed column, a single column with a separate debit/credit type column, or separate money-in and money-out columns) and the running balance. Answer only with column and row numbers as shown.',
    user: 'First rows:\n' + show(0, Math.min(rows.length, 45)) + (rows.length > 50 ? '\n…\nLast rows:\n' + show(rows.length - 5, rows.length) : ''),
    toolName: 'statement_columns', toolDescription: 'Record where the headings are and which column is which.', jsonSchema: MAP_SCHEMA, schema: MapZ
  })
  const w = Math.max(0, ...rows.map((r) => r.length)), ok = (i: number | null) => i === null || (i >= 0 && i < w)
  if (output.header_row >= rows.length || !ok(output.date) || !ok(output.amount) || !ok(output.debit) || !ok(output.credit) || !ok(output.direction) || !ok(output.balance) || (output.amount === null && output.debit === null && output.credit === null)) throw new Error('header')
  return { ...output, description: output.description.filter((i) => ok(i)) }
}
// Any table-like statement (CSV or Excel): by headings first; if that finds nothing, the AI maps the layout.
export async function parseStatementTable(rows: string[][], currency: string, inputRef: string): Promise<ParsedStatement> {
  try { const r = parseRows(rows, currency); if (r.txns.length) return r } catch { /* other layout */ }
  return parseRows(rows, currency, await aiStatementMap(rows, inputRef))
}

// ── PDF (the AI reads the statement; the tie-out check decides whether it can be saved)
const Txn = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), description: z.string().max(500), amount: z.number().finite(), balance: z.number().finite().nullable() })
const Stmt = z.object({
  period_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(), period_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  opening: z.number().finite().nullable(), closing: z.number().finite().nullable(), transactions: z.array(Txn).max(3000), notes: z.string().max(500)
})
const STMT_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['period_start', 'period_end', 'opening', 'closing', 'transactions', 'notes'],
  properties: {
    period_start: { type: ['string', 'null'], description: 'Statement start date, YYYY-MM-DD' },
    period_end: { type: ['string', 'null'], description: 'Statement end date, YYYY-MM-DD' },
    opening: { type: ['number', 'null'], description: 'Opening balance as printed' },
    closing: { type: ['number', 'null'], description: 'Closing balance as printed' },
    transactions: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['date', 'description', 'amount', 'balance'], properties: {
      date: { type: 'string', description: 'YYYY-MM-DD' }, description: { type: 'string' },
      amount: { type: 'number', description: 'Money in positive, money out negative' }, balance: { type: ['number', 'null'], description: 'Running balance if printed' } } } },
    notes: { type: 'string', description: 'One line: anything unclear, pages skipped, currency' }
  }
}
export async function parsePdf(buf: Buffer, inputRef: string, media: 'application/pdf' | 'image/png' | 'image/jpeg' = 'application/pdf'): Promise<ParsedStatement> {
  const { output } = await runAiTool<z.infer<typeof Stmt>>({
    task: 'bank_statement_extract', model: useRuntimeConfig().aiModelPitchScreen, promptVersion: 'bank-extract-v1', inputRef,
    system: 'You transcribe bank statements exactly. Copy every transaction in order with its date, description and amount (money in positive, money out negative) and the running balance if printed. ' +
      'Copy the printed opening and closing balances. Never invent, merge or round figures. If something is unreadable, leave it out and say so in notes.',
    user: '', userContent: [
      media === 'application/pdf' ? { type: 'document', source: { type: 'base64', media_type: media, data: buf.toString('base64') } } : { type: 'image', source: { type: 'base64', media_type: media, data: buf.toString('base64') } },
      { type: 'text', text: 'Transcribe this bank statement.' }
    ],
    toolName: 'record_statement', toolDescription: 'Record the statement period, balances and every transaction.',
    jsonSchema: STMT_SCHEMA, schema: Stmt, maxTokens: 16000
  })
  return { period_start: output.period_start, period_end: output.period_end, opening: output.opening, closing: output.closing, notes: output.notes,
    txns: output.transactions.map((t) => ({ date: t.date, description: t.description.slice(0, 500) || '—', amount: Math.round(t.amount * 100) / 100, balance: t.balance })) }
}

// ── Tie-out
export function tieOut(opening: number, closing: number, txns: ParsedTxn[]): { credits: number; debits: number; expected: number; difference: number; ok: boolean } {
  const credits = Math.round(txns.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0) * 100) / 100
  const debits = Math.round(-txns.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0) * 100) / 100
  const expected = Math.round((opening + credits - debits) * 100) / 100
  const difference = Math.round((closing - expected) * 100) / 100
  return { credits, debits, expected, difference, ok: Math.abs(difference) < 0.005 }
}
