// Add a brokerage or investment account's month-end valuations (cash, holdings at market value, total, accrued
// interest) from a CSV or Excel file: the account becomes a brokerage account, its payments are put under
// investment, interest, fees and transfers, and each month is checked against the cash from its transactions.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp')
  await rateLimit('treasury_upload', user.userId, 30, 60 * 60 * 1000)
  const parts = await readMultipartFormData(event)
  const file = parts?.find((p) => p.name === 'file' && p.filename), field = (n: string) => parts?.find((p) => p.name === n)?.data.toString('utf8').trim() ?? ''
  if (!file || !file.data.length) throw apiError('invalid', 'Choose the valuation file (CSV or Excel).')
  if (file.data.length > 5 * 1024 * 1024) throw apiError('too_large', 'Valuation files can be up to 5 MB.', 413)
  const ext = (file.filename ?? '').split('.').pop()?.toLowerCase()
  if (ext !== 'csv' && ext !== 'xlsx') throw apiError('bad_type', 'Upload the valuation as CSV or Excel (.xlsx).')
  const currency = /^[A-Z]{3}$/.test(field('currency')) ? field('currency') : 'USD', account = field('account').slice(0, 120)
  if (!account) throw apiError('invalid', 'Choose the account or give it a name.')
  const sc = await forecastScope(event), pick = z.string().uuid().safeParse(field('entity_id'))
  const ent = !sc.group ? sc.entity : pick.success && sc.companies.some((c) => c.id === pick.data) ? pick.data : await companyEntityId()
  if (!ent) throw apiError('invalid', 'Choose the company.')
  let rows: string[][]
  if (ext === 'csv') rows = parseCsvRows(file.data.toString('utf8'))
  else { const g = (await readGrids(file.data, 'xlsx')).sort((a, b) => b.rows.length - a.rows.length)[0]; rows = (g?.rows ?? []).map((r) => r.map((c) => (c === null ? '' : String(c)))) }
  let vals: Valuation[]
  try { vals = parseValuations(rows) } catch (e) { throw apiError('unreadable', (e as Error).message === 'header' ? 'We could not find the month end, cash and holdings columns. Start from the brokerage template.' : 'No months were found in that file.', 422) }
  await markBrokerage(ent, account, currency)
  await saveValuations(ent, account, currency, vals)
  const recat = await fixBrokerage()
  const check = await valuationCheck(ent, account)
  await audit({ event, actorUserId: user.userId, action: 'treasury.valuation', objectType: 'bank_account', detail: { months: vals.length, recategorised: recat } })
  const last = vals[vals.length - 1]!
  return { ok: true, months: vals.length, from: vals[0]!.month_end, to: last.month_end, latest: last, recategorised: recat, check }
})
