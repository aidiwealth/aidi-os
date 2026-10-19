// An accountant's or adviser's forecast (Excel, CSV or PDF): AI reads each line and month and says where it belongs in
// a Finvry forecast. The founder checks the mapping and the totals before it is saved as a new forecast.
import { z } from 'zod'
export const MAP_TO = ['revenue', 'cogs', 'payroll', 'marketing', 'rnd', 'ga', 'other', 'tax', 'items', 'funding', 'customers', 'headcount', 'cash_balance', 'new', 'ignore'] as const
const SCHEMA = { type: 'object', additionalProperties: false, required: ['currency', 'start', 'opening_cash', 'lines', 'notes'],
  properties: {
    currency: { type: 'string', description: 'ISO currency of the figures.' },
    start: { type: 'string', description: 'First FORECAST month, YYYY-MM (skip actual/historic months unless the file only has a forecast).' },
    opening_cash: { type: ['number', 'null'], description: 'Cash at the start of the first forecast month (the closing cash of the month before), if shown.' },
    lines: { type: 'array', description: 'Every line of the forecast with figures, in file order, including subtotals (mapped to ignore).', items: { type: 'object', additionalProperties: false, required: ['label', 'maps_to', 'values'],
      properties: {
        label: { type: 'string', description: 'The line name as written, with its section if useful (e.g. "Opex - Google Ads").' },
        maps_to: { type: 'string', enum: [...MAP_TO], description: 'new: an operating cost the company tracks on its own line that is none of the others (kept as its own cost line). revenue: sales/income. cogs: direct costs, hosting, payment fees, cost of sales. payroll: salaries, wages, benefits, contractors, pension. marketing: sales & marketing, ads, events, commissions. rnd: product/engineering tools and R&D (non-payroll). ga: rent, legal, accounting, insurance, admin, software, travel. other: any other operating cost. tax: income/corporate tax. items: one-off or below-the-line cash items (capex, equipment, loan repayments, interest, VAT timing; signed + in / − out). funding: equity or debt raised (money in). customers: customer count. headcount: number of staff. cash_balance: closing cash/bank balance (used only to check). ignore: totals, subtotals, gross profit, EBITDA, net income, percentages, depreciation and other non-cash lines.' },
        values: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['month', 'value'], properties: { month: { type: 'string', description: 'YYYY-MM' }, value: { type: 'number', description: 'Full number for that month. Costs as POSITIVE numbers even if shown negative or in brackets. Items signed.' } } } } } } },
    notes: { type: 'array', items: { type: 'string' }, description: 'Short notes for the founder: assumptions, quarterly or yearly figures you split into months, unclear lines. Max 8.' } } }
const Line = z.object({ label: z.string().trim().min(1).max(200), maps_to: z.enum(MAP_TO).catch('ignore'), values: z.array(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/), value: z.number().finite() })).max(72) })
export const SheetSchema = z.object({ currency: z.string().regex(/^[A-Z]{3}$/).catch('USD'), start: z.string().regex(/^\d{4}-\d{2}$/), opening_cash: z.number().finite().nullable().catch(null), lines: z.array(Line).max(200), notes: z.array(z.string().max(500)).max(10).catch([]) })
export type ReadSheet = z.infer<typeof SheetSchema>
export async function readForecastFiles(files: InFile[], company: string, ref: string): Promise<ReadSheet> {
  const content = await filesToContent(files)
  const { output } = await runAiTool({ task: 'forecast_import', model: useRuntimeConfig().aiModelPitchScreen, promptVersion: 'forecast-import-v1', inputRef: ref,
    system: 'You read a startup\'s financial forecast prepared by its accountant or adviser (a spreadsheet or PDF: P&L, cash flow, budget or financial model) and map every line into a simple monthly forecast. ' +
      'Take the numbers exactly as written; never invent or extrapolate. If figures are quarterly or yearly, split them evenly into months and say so in notes. Use the monthly P&L or cash-flow sheet; if there are both, take revenue and costs from the P&L and funding, capex and loans from the cash flow. ' +
      'Map subtotals and totals to ignore so nothing is counted twice. Write full numbers (12.5k → 12500; figures "in thousands" × 1000). Skip historic/actual months unless the file has nothing else.',
    user: '', userContent: [...content, { type: 'text', text: 'Map this forecast for ' + company + '.' }],
    toolName: 'record_forecast', toolDescription: 'Record the forecast lines and where each belongs.', jsonSchema: SCHEMA, schema: SheetSchema, maxTokens: 16000 })
  return output
}
