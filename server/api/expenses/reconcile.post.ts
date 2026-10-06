// AI reconciliation: compare logged payments with an uploaded spreadsheet (bank export, ledger, expense report, or a
// balance sheet / P&L) for a period, so the numbers in Aidi OS do not drift from the source of truth.
import ExcelJS from 'exceljs'
import { z } from 'zod'
const Out = z.object({
  summary: z.string(), sheet_kind: z.string(),
  totals: z.object({ logged: z.number(), sheet: z.number(), difference: z.number(), currency: z.string() }),
  matched: z.array(z.object({ log_number: z.string(), sheet_row: z.string(), note: z.string().optional() })).max(500),
  missing_in_log: z.array(z.object({ date: z.string(), payee: z.string(), amount: z.number(), currency: z.string(), category: z.string().optional(), sheet_row: z.string() })).max(300),
  missing_in_sheet: z.array(z.object({ log_number: z.string(), note: z.string().optional() })).max(300),
  mismatched: z.array(z.object({ log_number: z.string(), sheet_row: z.string(), issue: z.string() })).max(300),
  category_checks: z.array(z.object({ category: z.string(), logged: z.number(), sheet: z.number(), note: z.string().optional() })).max(60) })
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp')
  const parts = (await readMultipartFormData(event)) ?? []
  const v = (k: string) => parts.find((p) => p.name === k && !p.filename)?.data.toString('utf8').trim() ?? ''
  const f = parts.find((p) => p.name === 'file' && p.filename && p.data.length)
  const from = v('from'), to = v('to'), entityId = v('entity_id')
  if (!f || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) throw apiError('invalid', 'Upload a spreadsheet and choose the period.')
  let rows: string[][] = []
  if (/\.csv$/i.test(f.filename ?? '') || /csv|text/.test(f.type ?? '')) rows = f.data.toString('utf8').split(/\r?\n/).filter(Boolean).map((l) => l.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((c) => c.replace(/^"|"$/g, '').trim()))
  else {
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(f.data as unknown as ArrayBuffer)
    for (const ws of wb.worksheets.slice(0, 3)) { rows.push(['## Sheet: ' + ws.name]); ws.eachRow((r) => { rows.push((r.values as unknown[]).slice(1).map((c) => { const x = c as { result?: unknown; text?: string } | Date | null; return x instanceof Date ? x.toISOString().slice(0, 10) : x && typeof x === 'object' ? String(x.result ?? x.text ?? '') : String(x ?? '') })) }) }
  }
  rows = rows.slice(0, 800)
  const sheet = rows.map((r, i) => 'R' + (i + 1) + ': ' + r.join(' | ')).join('\n').slice(0, 120000)
  const logged = (await db().query("SELECT number, to_char(paid_on, 'YYYY-MM-DD') AS paid_on, payee, category, amount::float AS amount, currency, reference FROM finance.expenses WHERE paid_on BETWEEN $1 AND $2 AND ($3 = '' OR entity_id::text = $3) ORDER BY paid_on", [from, to, entityId])).rows
  const { output } = await runAiTool({ task: 'expense_reconcile', model: useRuntimeConfig().aiModelPitchScreen, promptVersion: 'expense-reconcile-v1', inputRef: 'expenses:' + from + ':' + to, maxTokens: 6000,
    system: 'You reconcile a company\'s logged payments against a spreadsheet it uploaded. The spreadsheet may be a bank export, a ledger, an expense report, or a balance sheet / profit and loss. Match payments by date (within a few days), amount and payee. Never invent rows. If the sheet is a balance sheet or P&L, compare category totals for the period instead of individual payments and explain differences. Amounts are positive numbers. Use the row labels (R1, R2…) to refer to sheet rows.',
    user: 'Period: ' + from + ' to ' + to + '\n\nLOGGED PAYMENTS (' + logged.length + '):\n' + JSON.stringify(logged) + '\n\nUPLOADED SHEET (' + (f.filename ?? '') + '):\n' + sheet,
    toolName: 'reconciliation', toolDescription: 'Reconciliation result', schema: Out,
    jsonSchema: { type: 'object', required: ['summary', 'sheet_kind', 'totals', 'matched', 'missing_in_log', 'missing_in_sheet', 'mismatched', 'category_checks'], properties: {
      summary: { type: 'string', description: 'Two or three plain sentences: does it reconcile, and what needs attention.' }, sheet_kind: { type: 'string' },
      totals: { type: 'object', required: ['logged', 'sheet', 'difference', 'currency'], properties: { logged: { type: 'number' }, sheet: { type: 'number' }, difference: { type: 'number' }, currency: { type: 'string' } } },
      matched: { type: 'array', items: { type: 'object', required: ['log_number', 'sheet_row'], properties: { log_number: { type: 'string' }, sheet_row: { type: 'string' }, note: { type: 'string' } } } },
      missing_in_log: { type: 'array', items: { type: 'object', required: ['date', 'payee', 'amount', 'currency', 'sheet_row'], properties: { date: { type: 'string' }, payee: { type: 'string' }, amount: { type: 'number' }, currency: { type: 'string' }, category: { type: 'string' }, sheet_row: { type: 'string' } } } },
      missing_in_sheet: { type: 'array', items: { type: 'object', required: ['log_number'], properties: { log_number: { type: 'string' }, note: { type: 'string' } } } },
      mismatched: { type: 'array', items: { type: 'object', required: ['log_number', 'sheet_row', 'issue'], properties: { log_number: { type: 'string' }, sheet_row: { type: 'string' }, issue: { type: 'string' } } } },
      category_checks: { type: 'array', items: { type: 'object', required: ['category', 'logged', 'sheet'], properties: { category: { type: 'string' }, logged: { type: 'number' }, sheet: { type: 'number' }, note: { type: 'string' } } } } } } })
  return output
})
