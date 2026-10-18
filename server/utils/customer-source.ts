// Where customer revenue comes from: an uploaded file (Excel, CSV, Word table or a PDF read by AI) or a live link to a
// Google Sheet / Excel online / Dropbox file that is re-read every day. Uploads are previewed (duplicates checked)
// before saving; a live link applies the merges the founder already confirmed and lists any new possible duplicates.
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { custKey } from '~/shared/customer-metrics'
import type { Cell, Grid } from './sheet-links'
import type { DupGroup, ParsedCust } from './customer-import'

// A Word document's tables as grids (no AI needed).
async function docxGrids(buf: Buffer): Promise<Grid[]> {
  const { default: JSZip } = await import('jszip')
  const zip = await JSZip.loadAsync(buf)
  const xml = await zip.file('word/document.xml')?.async('string')
  if (!xml) throw apiError('unreadable', 'That Word file could not be read.', 422)
  const dec = (t: string) => t.replace(/<w:tab\/>/g, ' ').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").trim()
  return [...xml.matchAll(/<w:tbl>([\s\S]*?)<\/w:tbl>/g)].map((t, i) => ({ name: 'Table ' + (i + 1), rows: [...t[1]!.matchAll(/<w:tr[ >]([\s\S]*?)<\/w:tr>/g)].map((r) => [...r[1]!.matchAll(/<w:tc>([\s\S]*?)<\/w:tc>/g)].map((c) => { const v = dec(c[1]!.replace(/<\/w:p>/g, ' ')); return v === '' ? null : v as Cell })) }))
}
// A PDF (statement, invoice list, report) read by AI into rows of customer, month and amount.
const PdfOut = z.object({ rows: z.array(z.object({ customer: z.string(), month: z.string(), amount: z.number(), currency: z.string(), segment: z.string(), sector: z.string() })).max(4000), note: z.string() })
async function pdfGrids(buf: Buffer, ref: string): Promise<{ grids: Grid[]; note: string }> {
  if (!useRuntimeConfig().anthropicApiKey) throw apiError('ai_off', 'Reading PDFs needs AI, which is not available just now. Upload the Excel or CSV instead.', 503)
  if (buf.length > 10 * 1024 * 1024) throw apiError('too_large', 'PDFs can be up to 10 MB.', 413)
  const { output } = await runAiTool({ task: 'customer_pdf', model: useRuntimeConfig().aiModelPitchScreen, promptVersion: 'customer-pdf-v1', inputRef: ref,
    system: 'You read a document that lists revenue by customer (a billing report, invoice list, statement or table). Return one row per customer per month with the amount billed or paid, its currency (ISO code, "" if not shown) and, if the document says so, the customer segment and sector ("" otherwise). Only use figures that appear in the document; never estimate. Skip totals and subtotals. Month as YYYY-MM.',
    userContent: [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: buf.toString('base64') } }, { type: 'text', text: 'List the customer revenue in this document.' }],
    user: 'List the customer revenue in this document.', toolName: 'record_customer_revenue', toolDescription: 'Record customer revenue rows.', schema: PdfOut, maxTokens: 16000,
    jsonSchema: { type: 'object', additionalProperties: false, required: ['rows', 'note'], properties: { note: { type: 'string' }, rows: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['customer', 'month', 'amount', 'currency', 'segment', 'sector'], properties: { customer: { type: 'string' }, month: { type: 'string' }, amount: { type: 'number' }, currency: { type: 'string' }, segment: { type: 'string' }, sector: { type: 'string' } } } } } } })
  if (!output.rows.length) throw apiError('unreadable', 'No customer revenue was found in that PDF.', 422)
  return { grids: [{ name: 'Document', rows: [['Customer', 'Month', 'Revenue', 'Currency', 'Segment', 'Sector'], ...output.rows.map((r) => [r.customer, r.month, r.amount, r.currency || null, r.segment || null, r.sector || null] as Cell[])] }], note: output.note }
}
export async function gridsFromFile(buf: Buffer, filename: string, ref: string): Promise<{ grids: Grid[]; note?: string }> {
  const ext = (filename.split('.').pop() ?? '').toLowerCase()
  if (ext === 'xlsx' || ext === 'csv') return { grids: await readGrids(buf, ext, { tabs: 40, rows: 60000, cols: 240 }) }
  if (ext === 'docx') return { grids: await docxGrids(buf) }
  if (ext === 'pdf') { const r = await pdfGrids(buf, ref); return { grids: r.grids, note: 'Read from the PDF by AI' + (r.note ? ': ' + r.note : '.') + ' Check the figures before saving.' } }
  throw apiError('bad_type', 'Upload an Excel (.xlsx), CSV, Word (.docx) or PDF file.')
}

// Read, check for duplicates and keep as a preview until the founder confirms.
export async function previewCustomers(grids: Grid[], filename: string, userId: string | null, extraNote?: string) {
  const ref = randomUUID()
  const cfg = await customerConfig()
  const parsed = await parseCustomers(grids, ref, cfg.currency)
  if (extraNote) parsed.notes.unshift(extraNote)
  const existing = (await db().query<{ name: string }>('SELECT name FROM financials.customers')).rows.map((r) => r.name)
  const dupes = await findDuplicates(parsed.customers.map((c) => c.name), existing, ref)
  const existingKeys = new Set(existing.map(custKey))
  const summary = { sheet: parsed.sheet, sheets: parsed.sheets ?? [], currency: parsed.currency ?? cfg.currency, layout: parsed.layout, customers: parsed.customers.length, rows: parsed.rows, repeated: parsed.repeated, skipped: parsed.skipped, first: parsed.months[0], last: parsed.months[parsed.months.length - 1], months: parsed.months.length,
    known: parsed.customers.filter((c) => existingKeys.has(custKey(c.name))).length, total: parsed.customers.reduce((s, c) => s + Object.values(c.rev).reduce((a, b) => a + b, 0), 0),
    attrs: ['segment', 'sector', 'country', 'plan', 'started_on', 'acquisition_cost', 'gross_margin_pct'].filter((a) => parsed.customers.some((c) => (c as unknown as Record<string, unknown>)[a] !== undefined)), ai_mapped: parsed.ai_mapped, notes: parsed.notes }
  const id = (await one<{ id: string }>('INSERT INTO financials.customer_imports (filename, data, summary, created_by) VALUES ($1,$2,$3,$4) RETURNING id', [filename.slice(0, 200), JSON.stringify(parsed.customers), JSON.stringify({ ...summary, dupes }), userId])).id
  return { id, summary, dupes, sample: parsed.customers.slice(0, 6).map((c) => ({ name: c.name, months: Object.keys(c.rev).length, total: Object.values(c.rev).reduce((a, b) => a + b, 0), segment: c.segment ?? null, sector: c.sector ?? null })), existing: existing.length }
}

// Save customers: merge the names the founder agreed are the same, then add the months (replacing the same months)
// or replace everything.
export async function applyCustomers(data: ParsedCust[], merges: { names: string[]; to: string }[], keepRepeats: boolean, mode: 'merge' | 'replace'): Promise<{ customers: number; months: number }> {
  const to = new Map<string, string>()
  for (const m of merges) for (const n of m.names) to.set(n, m.to)
  const merged = new Map<string, ParsedCust>()
  for (const c of data) {
    const name = to.get(c.name) ?? c.name, k = custKey(name)
    const t = merged.get(k) ?? { name, rev: {} }
    for (const [m, v] of Object.entries(c.rev)) t.rev[m] = Math.round(((t.rev[m] ?? 0) + v) * 100) / 100
    if (keepRepeats && c.rep) for (const [m, v] of Object.entries(c.rep)) t.rev[m] = Math.round(((t.rev[m] ?? 0) + v) * 100) / 100
    for (const a of ['segment', 'sector', 'country', 'plan', 'started_on', 'acquisition_cost', 'gross_margin_pct'] as const) if (c[a] !== undefined && t[a] === undefined) (t as unknown as Record<string, unknown>)[a] = c[a]
    merged.set(k, t)
  }
  if (mode === 'replace') await db().query('DELETE FROM financials.customers')
  for (const m of merges) {
    const keep = custKey(m.to)
    const others = m.names.map(custKey).filter((k) => k !== keep)
    if (!others.length) continue
    const target = (await db().query<{ id: string }>('INSERT INTO financials.customers (name, key) VALUES ($1,$2) ON CONFLICT (organization_id, key) DO UPDATE SET updated_at = now() RETURNING id', [m.to, keep])).rows[0]!.id
    const olds = (await db().query<{ id: string }>('SELECT id FROM financials.customers WHERE key = ANY($1::text[]) AND id <> $2', [others, target])).rows.map((r) => r.id)
    if (olds.length) {
      await db().query(`INSERT INTO financials.customer_revenue (customer_id, month, amount) SELECT $1, month, sum(amount) FROM financials.customer_revenue WHERE customer_id = ANY($2::uuid[]) GROUP BY month
        ON CONFLICT (customer_id, month) DO UPDATE SET amount = financials.customer_revenue.amount + EXCLUDED.amount`, [target, olds])
      await db().query(`UPDATE financials.customers t SET segment = coalesce(t.segment, o.segment), sector = coalesce(t.sector, o.sector), country = coalesce(t.country, o.country), plan = coalesce(t.plan, o.plan), started_on = coalesce(t.started_on, o.started_on), acquisition_cost = coalesce(t.acquisition_cost, o.acquisition_cost), gross_margin_pct = coalesce(t.gross_margin_pct, o.gross_margin_pct)
        FROM (SELECT * FROM financials.customers WHERE id = ANY($2::uuid[]) LIMIT 1) o WHERE t.id = $1`, [target, olds])
      await db().query('DELETE FROM financials.customers WHERE id = ANY($1::uuid[])', [olds])
    }
  }
  let customers = 0, months = 0
  for (const [k, c] of merged) {
    const id = (await db().query<{ id: string }>(`INSERT INTO financials.customers (name, key, segment, sector, country, plan, started_on, acquisition_cost, gross_margin_pct) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (organization_id, key) DO UPDATE SET segment = coalesce(EXCLUDED.segment, financials.customers.segment), sector = coalesce(EXCLUDED.sector, financials.customers.sector), country = coalesce(EXCLUDED.country, financials.customers.country),
        plan = coalesce(EXCLUDED.plan, financials.customers.plan), started_on = coalesce(EXCLUDED.started_on, financials.customers.started_on), acquisition_cost = coalesce(EXCLUDED.acquisition_cost, financials.customers.acquisition_cost),
        gross_margin_pct = coalesce(EXCLUDED.gross_margin_pct, financials.customers.gross_margin_pct), updated_at = now() RETURNING id`,
      [c.name, k, c.segment ?? null, c.sector ?? null, c.country ?? null, c.plan ?? null, c.started_on ?? null, c.acquisition_cost ?? null, c.gross_margin_pct ?? null])).rows[0]!.id
    const ms = Object.keys(c.rev)
    if (ms.length) await db().query(`INSERT INTO financials.customer_revenue (customer_id, month, amount) SELECT $1, (m || '-01')::date, a FROM unnest($2::text[], $3::numeric[]) AS x(m, a)
      ON CONFLICT (customer_id, month) DO UPDATE SET amount = EXCLUDED.amount`, [id, ms, ms.map((m) => c.rev[m])])
    customers++; months += ms.length
  }
  await db().query("DELETE FROM financials.analyses WHERE subject LIKE 'customers:%'").catch(() => {})
  return { customers, months }
}

// The live link: the founder's confirmed merges are kept (aliases) and applied on every read.
export interface CustLink { url: string | null; name: string | null; auto: boolean; synced_at: string | null; error: string | null; result: { customers?: number; months?: number; possible?: DupGroup[]; notes?: string[] } | null; aliases: Record<string, string> }
export async function customerLink(): Promise<CustLink> {
  const r = (await db().query<CustLink>("SELECT link_url AS url, link_name AS name, link_auto AS auto, to_char(link_synced_at, 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') AS synced_at, link_error AS error, link_result AS result, coalesce(aliases, '{}'::jsonb) AS aliases FROM financials.customer_config LIMIT 1")).rows[0]
  return r ?? { url: null, name: null, auto: true, synced_at: null, error: null, result: null, aliases: {} }
}
export async function rememberMerges(merges: { names: string[]; to: string }[]) {
  if (!merges.length) return
  const a: Record<string, string> = {}
  for (const m of merges) for (const n of m.names) if (n !== m.to) a[n] = m.to
  await db().query("INSERT INTO financials.customer_config (aliases) VALUES ($1::jsonb) ON CONFLICT (organization_id) DO UPDATE SET aliases = coalesce(financials.customer_config.aliases, '{}'::jsonb) || EXCLUDED.aliases", [JSON.stringify(a)])
}
export async function syncCustomerLink(): Promise<{ customers: number; months: number; possible: number }> {
  const l = await customerLink()
  if (!l.url) throw apiError('invalid', 'Link a sheet first.')
  try {
    const f = await fetchLinkedSheet(l.url)
    const ref = randomUUID(), cfg = await customerConfig()
    const parsed = await parseCustomers(await readGrids(f.buf, f.ext, { tabs: 40, rows: 60000, cols: 240 }), ref, cfg.currency)
    const existing = (await db().query<{ name: string }>('SELECT name FROM financials.customers')).rows.map((r) => r.name)
    const dupes = await findDuplicates(parsed.customers.map((c) => c.name), existing, ref)
    // Merges confirmed before, plus exact-name matches; anything else is listed for the founder to decide.
    const merges: { names: string[]; to: string }[] = []
    const byTo = new Map<string, string[]>()
    for (const c of parsed.customers) { const to = l.aliases[c.name]; if (to) byTo.set(to, [...(byTo.get(to) ?? [to]), c.name]) }
    for (const [to, names] of byTo) merges.push({ names: [...new Set(names)], to })
    const possible: DupGroup[] = []
    for (const d of dupes) { if (d.names.every((n) => l.aliases[n] || byTo.has(n))) continue; if (d.sure) merges.push({ names: d.names, to: d.to }); else possible.push(d) }
    const r = await applyCustomers(parsed.customers, merges, false, 'replace')
    await db().query("UPDATE financials.customer_config SET link_synced_at = now(), link_error = NULL, link_result = $1::jsonb", [JSON.stringify({ customers: r.customers, months: r.months, possible, notes: parsed.notes })])
    return { ...r, possible: possible.length }
  } catch (e) {
    const msg = (e as { data?: { error?: { message?: string } } }).data?.error?.message ?? (e as Error).message ?? 'Could not read the sheet.'
    await db().query('UPDATE financials.customer_config SET link_error = $1', [msg.slice(0, 400)])
    throw e
  }
}
