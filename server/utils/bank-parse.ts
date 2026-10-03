// Turning bank statement files into transactions. CSV is parsed directly; PDF is read by Claude.
// Whatever the source, a statement is only saved if opening + money in - money out = closing.
import { z } from 'zod'

export interface ParsedTxn { date: string; description: string; amount: number; balance: number | null }
export interface ParsedStatement { period_start: string | null; period_end: string | null; opening: number | null; closing: number | null; txns: ParsedTxn[]; notes: string }

// ── CSV
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
export function parseCsv(text: string, currency: string): ParsedStatement {
  const rows = csvRows(text)
  const hi = rows.findIndex((r) => r.some((c) => H.date.test(c)) && (r.some((c) => H.amount.test(c)) || (r.some((c) => H.debit.test(c)) && r.some((c) => H.credit.test(c)))))
  if (hi < 0) throw new Error('header')
  const head = rows[hi]!
  const col = (re: RegExp, not?: RegExp) => head.findIndex((c) => re.test(c) && !(not && not.test(c)))
  const ci = { date: col(H.date), desc: col(H.desc), amount: col(H.amount), debit: col(H.debit, H.balance), credit: col(H.credit, H.balance), balance: col(H.balance) }
  const body = rows.slice(hi + 1).filter((r) => r[ci.date])
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

// ── PDF (Claude reads the statement; the tie-out check decides whether it can be saved)
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
export async function parsePdf(buf: Buffer, inputRef: string): Promise<ParsedStatement> {
  const { output } = await runAiTool<z.infer<typeof Stmt>>({
    task: 'bank_statement_extract', model: useRuntimeConfig().aiModelPitchScreen, promptVersion: 'bank-extract-v1', inputRef,
    system: 'You transcribe bank statements exactly. Copy every transaction in order with its date, description and amount (money in positive, money out negative) and the running balance if printed. ' +
      'Copy the printed opening and closing balances. Never invent, merge or round figures. If something is unreadable, leave it out and say so in notes.',
    user: '', userContent: [
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: buf.toString('base64') } },
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
