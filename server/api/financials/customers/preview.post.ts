// Read an uploaded customer revenue file and check it for duplicates before anything is saved.
import { custKey } from '~/shared/customer-metrics'
import { randomUUID } from 'node:crypto'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  const parts = (await readMultipartFormData(event)) ?? []
  const file = parts.find((p) => p.name === 'file' && p.filename)
  if (!file || !file.data.length) throw apiError('invalid', 'Choose a file.')
  if (file.data.length > 15 * 1024 * 1024) throw apiError('too_large', 'Files can be up to 15 MB.', 413)
  const ext = (file.filename ?? '').split('.').pop()?.toLowerCase()
  if (ext !== 'xlsx' && ext !== 'csv') throw apiError('bad_type', 'Upload an Excel (.xlsx) or CSV file.')
  const grids = await readGrids(Buffer.from(file.data), ext, { tabs: 8, rows: 60000, cols: 240 })
  const ref = randomUUID()
  const parsed = await parseCustomers(grids, ref)
  const existing = (await db().query<{ name: string }>('SELECT name FROM financials.customers')).rows.map((r) => r.name)
  const dupes = await findDuplicates(parsed.customers.map((c) => c.name), existing, ref)
  const existingKeys = new Set(existing.map(custKey))
  const summary = { sheet: parsed.sheet, layout: parsed.layout, customers: parsed.customers.length, rows: parsed.rows, repeated: parsed.repeated, skipped: parsed.skipped, first: parsed.months[0], last: parsed.months[parsed.months.length - 1], months: parsed.months.length,
    known: parsed.customers.filter((c) => existingKeys.has(custKey(c.name))).length, total: parsed.customers.reduce((s, c) => s + Object.values(c.rev).reduce((a, b) => a + b, 0), 0),
    attrs: ['segment', 'sector', 'country', 'plan', 'started_on', 'acquisition_cost', 'gross_margin_pct'].filter((a) => parsed.customers.some((c) => (c as unknown as Record<string, unknown>)[a] !== undefined)), ai_mapped: parsed.ai_mapped, notes: parsed.notes }
  const id = (await one<{ id: string }>('INSERT INTO financials.customer_imports (filename, data, summary, created_by) VALUES ($1,$2,$3,$4) RETURNING id', [(file.filename ?? '').slice(0, 200), JSON.stringify(parsed.customers), JSON.stringify({ ...summary, dupes }), user.userId])).id
  return { id, summary, dupes, sample: parsed.customers.slice(0, 6).map((c) => ({ name: c.name, months: Object.keys(c.rev).length, total: Object.values(c.rev).reduce((a, b) => a + b, 0), segment: c.segment ?? null, sector: c.sector ?? null })), existing: existing.length }
})
