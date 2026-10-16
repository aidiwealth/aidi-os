// Read an uploaded Excel or CSV file into a small text grid, then ask Claude to pull out the month's metrics.
// The founder always sees and confirms the numbers before anything is saved.
import type ExcelJS from 'exceljs'
import { z } from 'zod'

const MAX_ROWS = 200, MAX_COLS = 30, MAX_CHARS = 30000

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return ''
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  if (typeof v === 'object') {
    if ('result' in v && v.result !== undefined) return cellText(v.result as ExcelJS.CellValue)
    if ('richText' in v) return v.richText.map((t) => t.text).join('')
    if ('text' in v) return String(v.text)
    return ''
  }
  return String(v)
}

export async function sheetToText(buf: Buffer, ext: 'xlsx' | 'csv', sheets = 3, maxRows = MAX_ROWS): Promise<string> {
  const lines: string[] = []
  if (ext === 'csv') {
    for (const line of buf.toString('utf8').split(/\r?\n/).slice(0, maxRows)) lines.push(line.slice(0, 2000))
  } else {
    const { default: Excel } = await import('exceljs') // loaded only when a file is uploaded
    const wb = new Excel.Workbook()
    await wb.xlsx.load(buf as unknown as ArrayBuffer)
    wb.worksheets.slice(0, sheets).forEach((ws) => {
      lines.push('## Sheet: ' + ws.name)
      let n = 0
      ws.eachRow({ includeEmpty: false }, (row) => {
        if (n++ >= maxRows) return
        const cells: string[] = []
        for (let c = 1; c <= Math.min(ws.columnCount, MAX_COLS); c++) cells.push(cellText(row.getCell(c).value).replace(/[\t\n]/g, ' ').slice(0, 60))
        lines.push(cells.join(' | ').replace(/( \| )+$/, ''))
      })
    })
  }
  return lines.join('\n').slice(0, sheets > 3 ? MAX_CHARS * 1.5 : MAX_CHARS)
}

const num = z.number().finite().nullable()
const Extract = z.object({
  revenue: num, gross_margin: num, net_burn: num, cash: num, customers: num, headcount: num,
  notes: z.string().max(500),
  highlights: z.string().max(4000).optional(), challenges: z.string().max(4000).optional(), asks: z.string().max(4000).optional()
})
export type Extracted = z.infer<typeof Extract>
const JSON_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['revenue', 'gross_margin', 'net_burn', 'cash', 'customers', 'headcount', 'notes'],
  properties: {
    revenue: { type: ['number', 'null'], description: 'Revenue for the month, in USD' },
    gross_margin: { type: ['number', 'null'], description: 'Gross margin as a percentage, e.g. 62 for 62%' },
    net_burn: { type: ['number', 'null'], description: 'Net cash burn for the month in USD, positive number; 0 if cash-flow positive' },
    cash: { type: ['number', 'null'], description: 'Cash balance at month end in USD' },
    customers: { type: ['number', 'null'], description: 'Paying customers at month end' },
    headcount: { type: ['number', 'null'], description: 'Headcount (full-time equivalents) at month end' },
    notes: { type: 'string', description: 'One short line: which sheet/column you used, any currency or unit assumptions, anything unclear' },
    highlights: { type: 'string', description: 'Only for a written report or update: its wins and progress, in short lines. Empty for a plain spreadsheet.' },
    challenges: { type: 'string', description: 'Only for a written report: challenges it mentions. Empty otherwise.' },
    asks: { type: 'string', description: 'Only for a written report: what the company asks investors for. Empty otherwise.' }
  }
}

export async function extractMetrics(text: string, periodLabelText: string, inputRef: string, pdf?: Buffer): Promise<Extracted> {
  const { output } = await runAiTool<Extracted>({
    task: 'report_extract', model: useRuntimeConfig().aiModelPitchScreen, promptVersion: 'report-extract-v1', inputRef,
    system: 'You read a startup\'s financial or KPI spreadsheet, or its investor update or report (PDF), and extract figures for the requested period. Only use numbers that appear in it. Read amounts with their scale (45k = 45000, $1.2m = 1200000). For a written report, also summarise its highlights, challenges and asks. ' +
      'If a figure is not clearly present for that month, return null; never estimate. If the sheet has several months, use the column for the requested month, ' +
      'or the latest month if the requested one is absent, and say so in notes. Convert thousands notation (e.g. 45k) to full numbers. ' +
      'If amounts are clearly in another currency, keep the numbers as they are and say which currency in notes.',
    user: 'Month requested: ' + periodLabelText + '\n\nSpreadsheet:\n' + text,
    userContent: pdf ? [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdf.toString('base64') } }, { type: 'text', text: 'Period requested: ' + periodLabelText }] : undefined,
    toolName: 'record_metrics', toolDescription: 'Record the month\'s metrics found in the spreadsheet.',
    jsonSchema: JSON_SCHEMA, schema: Extract, maxTokens: pdf ? 2500 : 600
  })
  return output
}
