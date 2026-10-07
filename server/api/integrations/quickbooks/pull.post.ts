// Pull a period from QuickBooks (P&L for the period, balance sheet at its end, cash flow) and propose the lines.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'admin')
  rateLimit('fin_extract', user.userId, 30, 60 * 60 * 1000)
  const b = z.object({ subject: z.string().max(80), period_type: z.enum(['month', 'quarter', 'year']), period_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Choose the period first.')
  const c = await qbConn(b.data.subject)
  if (!c) throw apiError('not_connected', 'Connect QuickBooks for this entity or company first.', 400)
  const r = periodRange(b.data.period_type, b.data.period_end)
  const [pl, bs, cf] = await Promise.all([qbGet(c, '/reports/ProfitAndLoss?start_date=' + r.start + '&end_date=' + r.end + '&accounting_method=Accrual'), qbGet(c, '/reports/BalanceSheet?start_date=' + r.end + '&end_date=' + r.end + '&accounting_method=Accrual'), qbGet(c, '/reports/CashFlow?start_date=' + r.start + '&end_date=' + r.end).catch(() => null)])
  const text = [reportText(pl, 'Profit and Loss'), reportText(bs, 'Balance Sheet'), cf ? reportText(cf, 'Statement of Cash Flows') : ''].join('\n\n')
  await db().query('UPDATE financials.connections SET last_pulled_at = now() WHERE id = $1', [c.id])
  try { const out = await extractStatement(text, b.data.period_type + ' ending ' + b.data.period_end, 'quickbooks:' + c.realm_id); return { ...out, period_end: b.data.period_end, period_type: b.data.period_type, kpis: Object.fromEntries(out.kpis.map((k) => [k.name, k.value])), source: 'QuickBooks' + (c.company_name ? ' · ' + c.company_name : '') } }
  catch (err) { if ((err as { statusCode?: number }).statusCode === 429) throw err; console.error('[financials] qb extract', err); throw apiError('ai_failed', 'Could not map the QuickBooks reports automatically. Try again or enter the figures by hand.', 502) }
})
