// Where customer revenue comes from: an uploaded file (Excel, CSV or a Word table, read by fixed rules with no AI) or a live link to a
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
export async function gridsFromFile(buf: Buffer, filename: string, ref: string): Promise<{ grids: Grid[]; note?: string }> {
  const ext = (filename.split('.').pop() ?? '').toLowerCase()
  if (ext === 'xlsx' || ext === 'csv') return { grids: await readGrids(buf, ext, { tabs: 40, rows: 60000, cols: 240 }) }
  if (ext === 'docx') return { grids: await docxGrids(buf) }
  // Figures are read by fixed rules only, so a PDF (which needs AI to read) is not taken.
  if (ext === 'pdf') throw apiError('bad_type', 'Customer revenue is read from a spreadsheet, with no AI, so every figure is exact. Put it in the Finvry customer revenue template (Download the template) and upload that.')
  throw apiError('bad_type', 'Upload an Excel (.xlsx), CSV or Word (.docx) file.')
}

// Read, check for duplicates and keep as a preview until the founder confirms.
export async function previewCustomers(grids: Grid[], filename: string, userId: string | null, extraNote?: string) {
  const ref = randomUUID()
  const cfg = await customerConfig()
  await saveFileRates(grids, 'customers')
  const parsed = await parseCustomers(grids, ref, cfg.currency)
  if (extraNote) parsed.notes.unshift(extraNote)
  const existing = (await db().query<{ name: string }>('SELECT name FROM financials.customers')).rows.map((r) => r.name)
  const dupes = await findDuplicates(parsed.customers.map((c) => c.name), existing, ref)
  const existingKeys = new Set(existing.map(custKey))
  const summary = { sheet: parsed.sheet, sheets: parsed.sheets ?? [], currency: parsed.currency ?? cfg.currency, layout: parsed.layout, customers: parsed.customers.length, rows: parsed.rows, repeated: parsed.repeated, skipped: parsed.skipped, first: parsed.months[0], last: parsed.months[parsed.months.length - 1], months: parsed.months.length,
    known: parsed.customers.filter((c) => existingKeys.has(custKey(c.name))).length, total: parsed.customers.reduce((s, c) => s + Object.values(c.rev).reduce((a, b) => a + b, 0), 0),
    attrs: ['segment', 'sector', 'country', 'plan', 'started_on', 'acquisition_cost', 'gross_margin_pct'].filter((a) => parsed.customers.some((c) => (c as unknown as Record<string, unknown>)[a] !== undefined)), ai_mapped: parsed.ai_mapped, notes: parsed.notes }
  // Uploads not saved within a day are dropped (each holds the whole file).
  await db().query("DELETE FROM financials.customer_imports WHERE status = 'preview' AND created_at < now() - interval '1 day'").catch(() => {})
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
  // Replace: every month is written again; customers keep their records (and ids) and those no longer in the data go.
  if (mode === 'replace') await db().query('DELETE FROM financials.customer_revenue')
  for (const m of merges) {
    const keep = custKey(m.to)
    const others = m.names.map(custKey).filter((k) => k !== keep)
    if (!others.length) continue
    const target = (await db().query<{ id: string }>(`INSERT INTO financials.customers (name, key) VALUES ($1,$2) ON CONFLICT (organization_id, (coalesce(entity_id, '00000000-0000-0000-0000-000000000000'::uuid)), key) DO UPDATE SET updated_at = now() RETURNING id`, [m.to, keep])).rows[0]!.id
    const olds = (await db().query<{ id: string }>('SELECT id FROM financials.customers WHERE key = ANY($1::text[]) AND id <> $2', [others, target])).rows.map((r) => r.id)
    if (olds.length) {
      await db().query(`INSERT INTO financials.customer_revenue (customer_id, month, amount) SELECT $1, month, sum(amount) FROM financials.customer_revenue WHERE customer_id = ANY($2::uuid[]) GROUP BY month
        ON CONFLICT (customer_id, month) DO UPDATE SET amount = financials.customer_revenue.amount + EXCLUDED.amount`, [target, olds])
      await db().query(`UPDATE financials.customers t SET segment = coalesce(t.segment, o.segment), sector = coalesce(t.sector, o.sector), country = coalesce(t.country, o.country), plan = coalesce(t.plan, o.plan), started_on = coalesce(t.started_on, o.started_on), acquisition_cost = coalesce(t.acquisition_cost, o.acquisition_cost), gross_margin_pct = coalesce(t.gross_margin_pct, o.gross_margin_pct)
        FROM (SELECT * FROM financials.customers WHERE id = ANY($2::uuid[]) LIMIT 1) o WHERE t.id = $1`, [target, olds])
      await db().query('DELETE FROM financials.customers WHERE id = ANY($1::uuid[])', [olds])
    }
  }
  // In batches (a file can have tens of thousands of customers and months): customers first, then their months.
  let customers = 0, months = 0
  const list = [...merged.entries()]
  for (let i = 0; i < list.length; i += 1000) {
    const part = list.slice(i, i + 1000), col = <T,>(f: (c: ParsedCust) => T) => part.map(([, c]) => f(c))
    const ids = (await db().query<{ id: string; key: string }>(`INSERT INTO financials.customers (name, key, segment, sector, country, plan, started_on, acquisition_cost, gross_margin_pct)
      SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::date[], $8::numeric[], $9::numeric[])
      ON CONFLICT (organization_id, (coalesce(entity_id, '00000000-0000-0000-0000-000000000000'::uuid)), key) DO UPDATE SET segment = coalesce(EXCLUDED.segment, financials.customers.segment), sector = coalesce(EXCLUDED.sector, financials.customers.sector), country = coalesce(EXCLUDED.country, financials.customers.country),
        plan = coalesce(EXCLUDED.plan, financials.customers.plan), started_on = coalesce(EXCLUDED.started_on, financials.customers.started_on), acquisition_cost = coalesce(EXCLUDED.acquisition_cost, financials.customers.acquisition_cost),
        gross_margin_pct = coalesce(EXCLUDED.gross_margin_pct, financials.customers.gross_margin_pct), updated_at = now() RETURNING id, key`,
      [col((c) => c.name), part.map(([k]) => k), col((c) => c.segment ?? null), col((c) => c.sector ?? null), col((c) => c.country ?? null), col((c) => c.plan ?? null), col((c) => c.started_on ?? null), col((c) => c.acquisition_cost ?? null), col((c) => c.gross_margin_pct ?? null)])).rows
    const idOf = new Map(ids.map((r) => [r.key, r.id]))
    const cid: string[] = [], mon: string[] = [], amt: number[] = []
    for (const [k, c] of part) { const id = idOf.get(k); if (!id) continue; customers++; for (const [m, v] of Object.entries(c.rev)) { cid.push(id); mon.push(m + '-01'); amt.push(v); months++ } }
    for (let j = 0; j < cid.length; j += 20000) await db().query(`INSERT INTO financials.customer_revenue (customer_id, month, amount) SELECT * FROM unnest($1::uuid[], $2::date[], $3::numeric[])
      ON CONFLICT (customer_id, month) DO UPDATE SET amount = EXCLUDED.amount`, [cid.slice(j, j + 20000), mon.slice(j, j + 20000), amt.slice(j, j + 20000)])
  }
  if (mode === 'replace') await db().query('DELETE FROM financials.customers WHERE key <> ALL($1::text[])', [list.map(([k]) => k)])
  await db().query("DELETE FROM financials.analyses WHERE subject LIKE 'customers:%'").catch(() => {})
  return { customers, months }
}

// The live link: the founder's confirmed merges are kept (aliases) and applied on every read.
export interface CustLink { url: string | null; name: string | null; auto: boolean; synced_at: string | null; error: string | null; result: { customers?: number; months?: number; possible?: DupGroup[]; notes?: string[] } | null; aliases: Record<string, string> }
export async function customerLink(): Promise<CustLink> {
  // A linked sheet belongs to one company; the group view has none of its own.
  if (!custEntityId()) return { url: null, name: null, auto: true, synced_at: null, error: null, result: null, aliases: {} }
  const r = (await db().query<CustLink>("SELECT link_url AS url, link_name AS name, link_auto AS auto, to_char(link_synced_at, 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') AS synced_at, link_error AS error, link_result AS result, coalesce(aliases, '{}'::jsonb) AS aliases FROM financials.customer_config LIMIT 1")).rows[0]
  return r ?? { url: null, name: null, auto: true, synced_at: null, error: null, result: null, aliases: {} }
}
export async function rememberMerges(merges: { names: string[]; to: string }[]) {
  if (!merges.length) return
  const a: Record<string, string> = {}
  for (const m of merges) for (const n of m.names) if (n !== m.to) a[n] = m.to
  await db().query("INSERT INTO financials.customer_config (aliases) VALUES ($1::jsonb) ON CONFLICT (organization_id, (coalesce(entity_id, '00000000-0000-0000-0000-000000000000'::uuid))) DO UPDATE SET aliases = coalesce(financials.customer_config.aliases, '{}'::jsonb) || EXCLUDED.aliases", [JSON.stringify(a)])
}
export async function syncCustomerLink(): Promise<{ customers: number; months: number; possible: number }> {
  const l = await customerLink()
  if (!l.url) throw apiError('invalid', 'Link a sheet first.')
  try {
    const f = await fetchLinkedSheet(l.url)
    const ref = randomUUID(), cfg = await customerConfig()
    const grids = await readGrids(f.buf, f.ext, { tabs: 40, rows: 60000, cols: 240 })
    await saveFileRates(grids, 'customers link')
    const parsed = await parseCustomers(grids, ref, cfg.currency)
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
