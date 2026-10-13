// Rental & Real Estate (by Aidi Haven): Airbnb imports (transaction-history CSV + Earnings report PDF), payout to bank
// matching, iCal calendars, listing refresh, rent for non-Airbnb leases, expenses, month figures and the P&L.
import { createHash, randomUUID } from 'node:crypto'
import type { H3Event } from 'h3'
import { z } from 'zod'

export const RENTAL_ADMIN_ROLES = ['admin', 'gp']
export const isRentalAdmin = (roles: string[]) => roles.some((r) => RENTAL_ADMIN_ROLES.includes(r))
const r2 = (n: number) => Math.round(n * 100) / 100
const num = (s: string | undefined | null): number | null => { const t = (s ?? '').replace(/[$,\s]/g, ''); if (!t) return null; const v = Number(t); return Number.isFinite(v) ? v : null }
const mdy = (s: string | undefined | null): string | null => { const m = (s ?? '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); return m ? m[3] + '-' + m[1]!.padStart(2, '0') + '-' + m[2]!.padStart(2, '0') : null }
export const norm = (s: string | null | undefined) => (s ?? '').toLowerCase().replace(/[–—-]/g, '-').replace(/[^a-z0-9@-]+/g, ' ').trim()

// ── Airbnb transaction-history CSV ─────────────────────────────────────────────────────────────────────────────────
function csvRows(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++ } else q = false } else cell += c }
    else if (c === '"') q = true
    else if (c === ',') { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); if (row.some((x) => x.trim() !== '')) rows.push(row); row = []; cell = '' }
    else cell += c
  }
  row.push(cell); if (row.some((x) => x.trim() !== '')) rows.push(row)
  return rows
}
export interface AirRow { type: string; txn_date: string; expected_arrival: string | null; confirmation_code: string | null; booked_on: string | null; check_in: string | null; check_out: string | null; nights: number | null; guest: string | null; listing: string | null; details: string | null; payout_ref: string | null; settled_by: string | null; currency: string; amount: number | null; paid_out: number | null; service_fee: number | null; fast_pay_fee: number | null; cleaning_fee: number | null; gross: number | null; remitted_tax: number | null; earnings_year: number | null; dedupe: string }
const COLS: Record<string, keyof AirRow | 'skip'> = { 'date': 'txn_date', 'arriving by date': 'expected_arrival', 'type': 'type', 'confirmation code': 'confirmation_code', 'booking date': 'booked_on', 'start date': 'check_in', 'end date': 'check_out', 'nights': 'nights', 'guest': 'guest', 'listing': 'listing', 'details': 'details', 'reference code': 'payout_ref', 'currency': 'currency', 'amount': 'amount', 'paid out': 'paid_out', 'service fee': 'service_fee', 'fast pay fee': 'fast_pay_fee', 'cleaning fee': 'cleaning_fee', 'gross earnings': 'gross', 'airbnb remitted tax': 'remitted_tax', 'earnings year': 'earnings_year' }
export function parseAirbnbCsv(text: string): AirRow[] {
  const rows = csvRows(text.replace(/^﻿/, ''))
  if (rows.length < 2) throw apiError('empty', 'No rows found in that CSV.', 422)
  const head = rows[0]!.map((h) => h.trim().toLowerCase())
  const idx = (k: string) => head.indexOf(k)
  if (idx('date') < 0 || idx('type') < 0 || idx('amount') < 0) throw apiError('header', 'This does not look like Airbnb\'s transaction history CSV (Date, Type, Amount… columns).', 422)
  const out: AirRow[] = []; let payout: string | null = null
  for (const r of rows.slice(1)) {
    const g = (k: string) => { const i = idx(k); return i < 0 ? '' : (r[i] ?? '').trim() }
    const type = g('type'); const date = mdy(g('date')); if (!type || !date) continue
    const row: AirRow = { type, txn_date: date, expected_arrival: mdy(g('arriving by date')), confirmation_code: g('confirmation code') || null, booked_on: mdy(g('booking date')), check_in: mdy(g('start date')), check_out: mdy(g('end date')), nights: num(g('nights')), guest: g('guest') || null, listing: g('listing') || null, details: g('details') || null, payout_ref: g('reference code') || null, settled_by: null, currency: g('currency') || 'USD', amount: num(g('amount')), paid_out: num(g('paid out')), service_fee: num(g('service fee')), fast_pay_fee: num(g('fast pay fee')), cleaning_fee: num(g('cleaning fee')), gross: num(g('gross earnings')), remitted_tax: num(g('airbnb remitted tax')), earnings_year: num(g('earnings year')), dedupe: '' }
    if (/^payout$/i.test(type)) { payout = row.payout_ref; row.dedupe = 'P:' + (row.payout_ref ?? date + ':' + row.paid_out) }
    else { row.settled_by = payout; row.dedupe = [type.slice(0, 1).toUpperCase(), row.confirmation_code ?? '', date, row.amount ?? '', /^reservation$/i.test(type) ? '' : (row.details ?? '').slice(0, 60)].join(':') }
    out.push(row)
  }
  void COLS
  if (!out.length) throw apiError('empty', 'No transactions found in that CSV.', 422)
  return out
}

// ── Earnings report PDF (monthly control totals) ──────────────────────────────────────────────────────────────────
export interface Control { period_start: string; period_end: string; gross: number; adjustments: number; service_fees: number; total: number; remitted_tax: number; nights: number | null; payout_total: number; homes: { name: string; gross: number; adjustments: number; service_fees: number; total: number; nights: number | null; remitted_tax: number | null }[] }
export async function parseEarningsPdf(buf: Buffer, ref: string): Promise<Control> {
  const Home = z.object({ name: z.string(), gross: z.number(), adjustments: z.number(), service_fees: z.number(), total: z.number(), nights: z.number().nullable(), remitted_tax: z.number().nullable() })
  const S = z.object({ period_start: z.string(), period_end: z.string(), gross: z.number(), adjustments: z.number(), service_fees: z.number(), total: z.number(), remitted_tax: z.number(), nights: z.number().nullable(), payout_total: z.number(), homes: z.array(Home) })
  const n = { type: 'number' }, nn = { type: ['number', 'null'] }
  const schema = { type: 'object', additionalProperties: false, required: ['period_start', 'period_end', 'gross', 'adjustments', 'service_fees', 'total', 'remitted_tax', 'nights', 'payout_total', 'homes'], properties: {
    period_start: { type: 'string', description: 'YYYY-MM-DD' }, period_end: { type: 'string', description: 'YYYY-MM-DD' }, gross: n, adjustments: n, service_fees: { type: 'number', description: 'As a positive number' }, total: n,
    remitted_tax: { type: 'number', description: 'Airbnb remitted taxes total' }, nights: nn, payout_total: { type: 'number', description: 'Sum of the Payout methods table' },
    homes: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['name', 'gross', 'adjustments', 'service_fees', 'total', 'nights', 'remitted_tax'], properties: { name: { type: 'string' }, gross: n, adjustments: n, service_fees: { type: 'number', description: 'Positive' }, total: n, nights: nn, remitted_tax: nn } } } } }
  const { output } = await runAiTool<z.infer<typeof S>>({ task: 'airbnb_earnings_extract', model: useRuntimeConfig().aiModelPitchScreen, promptVersion: 'airbnb-earnings-v1', inputRef: ref,
    system: 'You transcribe Airbnb host Earnings reports exactly. Copy the figures as printed; never invent or round. Service fees are given as positive numbers. For each home in the Homes table also take its nights booked (Performance stats by home) and its Airbnb remitted tax (Taxes table).',
    user: '', userContent: [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: buf.toString('base64') } }, { type: 'text', text: 'Transcribe this Earnings report.' }],
    toolName: 'record_earnings', toolDescription: 'Record the report period, summary, payout total and each home.', jsonSchema: schema, schema: S, maxTokens: 3000 })
  return output
}

// ── Units ─────────────────────────────────────────────────────────────────────────────────────────────────────────
export interface UnitRow { id: string; property_id: string; property: string; name: string; aliases: string[]; title: string | null; airbnb_listing_id: string | null; rental_model: string; source: string }
export async function allUnits(): Promise<UnitRow[]> {
  return (await db().query<UnitRow>('SELECT u.id, u.property_id, p.name AS property, u.name, u.aliases, u.title, u.airbnb_listing_id, u.rental_model, u.source FROM rentals.units u JOIN rentals.properties p ON p.id = u.property_id WHERE u.active ORDER BY p.sort, p.name, u.sort, u.name')).rows
}
export function matchUnit(units: UnitRow[], name: string | null): UnitRow | null {
  const k = norm(name); if (!k) return null
  return units.find((u) => [u.name, u.title, ...u.aliases].some((a) => norm(a) === k)) ?? null
}

// ── Import: preview, then save ────────────────────────────────────────────────────────────────────────────────────
export interface Check { ok: boolean; label: string; detail: string }
// Airbnb's Earnings report takes the service fee refunded on an adjustment (a stay cut short or changed) off both
// gross earnings and service fees; the CSV puts that fee on the Adjustment row. Same here, so the figures match.
export const adjFee = (r: { type: string; service_fee: number | null }) => (/^adjustment$/i.test(r.type) ? Math.abs(r.service_fee ?? 0) : 0)
const monthName = (iso: string) => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })
const reportLabel = (c: Control) => c.period_start.slice(0, 7) === c.period_end.slice(0, 7) ? monthName(c.period_start) : monthName(c.period_start) + ' – ' + monthName(c.period_end)
// One or more Earnings reports (a month, a year, or a custom range): each is checked against the CSV rows in its period.
export function importChecks(rows: AirRow[], units: UnitRow[], controls: Control[]): { period: string | null; checks: Check[]; unmatched: string[] } {
  const checks: Check[] = []
  const months = new Map<string, number>(); for (const r of rows) months.set(r.txn_date.slice(0, 7), (months.get(r.txn_date.slice(0, 7)) ?? 0) + 1)
  const sorted = [...controls].sort((x, y) => x.period_start.localeCompare(y.period_start))
  const period = sorted[0] ? sorted[0].period_start.slice(0, 7) : [...months.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null
  const unmatched = [...new Set(rows.filter((r) => r.listing && !matchUnit(units, r.listing)).map((r) => r.listing!))]
  checks.push(unmatched.length ? { ok: false, label: 'Listings', detail: 'Not matched to a room or unit: ' + unmatched.join(', ') + '. Add the name to that unit under Properties.' } : { ok: true, label: 'Listings', detail: 'Every row matched a room or unit.' })
  const payouts = rows.filter((r) => /^payout$/i.test(r.type))
  // Each payout equals the rows it settles.
  const bad = payouts.filter((p) => { const s = rows.filter((r) => r.settled_by === p.payout_ref).reduce((t, r) => t + (r.amount ?? 0), 0); return Math.abs(s - (p.paid_out ?? 0)) > 0.009 })
  checks.push(bad.length ? { ok: false, label: 'Payouts', detail: bad.length + ' payout(s) do not equal the rows they settle: ' + bad.map((x) => x.payout_ref).join(', ') } : { ok: true, label: 'Payouts', detail: payouts.length + ' payouts, each equal to the bookings it settles.' })
  for (const control of sorted) {
    const tag = sorted.length > 1 ? ' · ' + reportLabel(control) : ''
    const inP = (r: AirRow) => r.txn_date >= control.period_start && r.txn_date <= control.period_end
    const paid = r2(payouts.filter(inP).reduce((t, r) => t + (r.paid_out ?? 0), 0))
    checks.push({ ok: Math.abs(paid - control.payout_total) < 0.01, label: 'Paid out' + tag, detail: 'CSV $' + paid.toFixed(2) + ' · Earnings report $' + control.payout_total.toFixed(2) })
    for (const h of control.homes) {
      const u = matchUnit(units, h.name)
      const mine = rows.filter((r) => inP(r) && u && matchUnit(units, r.listing)?.id === u.id)
      const g = r2(mine.reduce((t, r) => t + (/^reservation$/i.test(r.type) ? r.gross ?? 0 : 0) - adjFee(r), 0))
      // Rounding: Airbnb rounds each line, so allow a cent per adjustment.
      const tol = 0.01 + 0.01 * mine.filter((r) => adjFee(r) > 0).length
      checks.push(!u ? { ok: false, label: h.name + tag, detail: 'Report name not matched to a unit.' } : { ok: Math.abs(g - h.gross) < tol, label: u.name + tag, detail: 'Gross: CSV $' + g.toFixed(2) + ' · report $' + h.gross.toFixed(2) })
    }
  }
  return { period, checks, unmatched }
}

export async function storeFile(event: H3Event, entityId: string | null, title: string, filename: string, data: Buffer, mime: string, userId: string, kind = 'other'): Promise<string> {
  void event
  const id = randomUUID(), ext = (filename.split('.').pop() ?? 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'bin', key = 'documents/' + id + '.' + ext
  await putObject({ key, body: new Uint8Array(data), contentType: mime })
  await db().query("INSERT INTO core.documents (id, entity_id, title, kind, sensitivity, storage_key, mime_type, size_bytes, sha256, uploaded_by) VALUES ($1,$2,$3,$4,'normal',$5,$6,$7,$8,$9)",
    [id, entityId, title.slice(0, 200), kind, key, mime, data.length, createHash('sha256').update(data).digest('hex'), userId])
  return id
}
export async function havenEntityId(): Promise<string | null> {
  return (await db().query<{ id: string }>("SELECT coalesce((SELECT entity_id FROM rentals.properties WHERE entity_id IS NOT NULL ORDER BY sort LIMIT 1), (SELECT id FROM core.entities WHERE name ILIKE 'Aidi Haven%' ORDER BY created_at LIMIT 1)) AS id")).rows[0]?.id ?? null
}
export async function lockedPeriods(): Promise<Set<string>> { return new Set((await db().query<{ period: string }>('SELECT period FROM rentals.locks')).rows.map((r) => r.period)) }
export async function assertUnlocked(date: string | null | undefined): Promise<void> {
  if (date && (await lockedPeriods()).has(date.slice(0, 7))) throw apiError('locked', 'That month is locked. An admin can unlock it under Money.', 409)
}

export async function saveImport(importId: string): Promise<{ added: number; duplicates: number }> {
  const imp = (await db().query<{ parsed: { rows: AirRow[] }; status: string; period: string | null; months: string[] }>('SELECT parsed, status, period, months FROM rentals.imports WHERE id = $1', [importId])).rows[0]
  if (!imp || imp.status !== 'preview') throw apiError('not_found', 'This import was already saved or discarded.', 404)
  const units = await allUnits(), locked = await lockedPeriods()
  let added = 0, duplicates = 0
  for (const r of imp.parsed.rows ?? []) {
    if (locked.has(r.txn_date.slice(0, 7))) { duplicates++; continue }
    const u = matchUnit(units, r.listing)
    const x = await db().query(`INSERT INTO rentals.transactions (import_id, unit_id, type, txn_date, expected_arrival, confirmation_code, booked_on, check_in, check_out, nights, guest, listing, details, payout_ref, settled_by, currency, amount, paid_out, service_fee, fast_pay_fee, cleaning_fee, gross, remitted_tax, earnings_year, dedupe)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25) ON CONFLICT (organization_id, dedupe) DO NOTHING`,
      [importId, u?.id ?? null, r.type, r.txn_date, r.expected_arrival, r.confirmation_code, r.booked_on, r.check_in, r.check_out, r.nights, r.guest, r.listing, r.details, r.payout_ref, r.settled_by, r.currency, r.amount, r.paid_out, r.service_fee, r.fast_pay_fee, r.cleaning_fee, r.gross, r.remitted_tax, r.earnings_year, r.dedupe])
    if (x.rowCount) added++; else duplicates++
  }
  await db().query("UPDATE rentals.imports SET status = 'saved', saved_at = now(), rows_new = $2, rows_dup = $3 WHERE id = $1", [importId, added, duplicates])
  await db().query('INSERT INTO rentals.activity (event, detail) VALUES ($1,$2)', ['Airbnb import', (imp.months?.length > 1 ? monthLabel(imp.months[0]!) + ' – ' + monthLabel(imp.months[imp.months.length - 1]!) + ': ' : imp.period ? monthLabel(imp.period) + ': ' : '') + added + ' new row' + (added === 1 ? '' : 's') + (duplicates ? ', ' + duplicates + ' already imported' : '')])
  await reconcile()
  return { added, duplicates }
}
export const monthLabel = (p: string) => new Date(p + '-01T12:00:00Z').toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })

// ── Payouts ↔ bank deposits ───────────────────────────────────────────────────────────────────────────────────────
// Exact amount, within 2 days before to 5 days after the "Arriving by" date, on the rentals entity's accounts.
export async function reconcile(): Promise<number> {
  const ent = await havenEntityId()
  const open = (await db().query<{ payout_ref: string; paid_out: string; arrive: string }>(`SELECT t.payout_ref, t.paid_out::text, to_char(coalesce(t.expected_arrival, t.txn_date), 'YYYY-MM-DD') AS arrive FROM rentals.transactions t
    WHERE t.type ILIKE 'payout' AND t.payout_ref IS NOT NULL AND NOT EXISTS (SELECT 1 FROM rentals.payout_matches m WHERE m.payout_ref = t.payout_ref) ORDER BY t.txn_date`)).rows
  let n = 0
  for (const p of open) {
    const hit = (await db().query<{ id: string }>(`SELECT b.id FROM banking.transactions b JOIN banking.accounts a ON a.id = b.account_id
      WHERE ($4::uuid IS NULL OR a.entity_id = $4) AND b.amount = $1::numeric AND b.txn_date BETWEEN $2::date - 2 AND $2::date + 5
        AND NOT EXISTS (SELECT 1 FROM rentals.payout_matches m WHERE m.bank_txn_id = b.id) AND NOT EXISTS (SELECT 1 FROM rentals.rent_charges c WHERE c.bank_txn_id = b.id)
      ORDER BY (b.description ILIKE '%airbnb%' OR b.description ILIKE '%' || $3 || '%') DESC, abs(b.txn_date - $2::date) LIMIT 1`, [p.paid_out, p.arrive, p.payout_ref, ent])).rows[0]
    if (hit) { await db().query("INSERT INTO rentals.payout_matches (payout_ref, bank_txn_id, method) VALUES ($1,$2,'auto') ON CONFLICT DO NOTHING", [p.payout_ref, hit.id]); n++ }
  }
  return n
}

// ── Rent for non-Airbnb leases ────────────────────────────────────────────────────────────────────────────────────
export async function ensureRentCharges(): Promise<void> {
  const leases = (await db().query<{ id: string; rent: string; due_day: number; starts_on: string; ends_on: string | null }>("SELECT id, rent::text, due_day, to_char(starts_on, 'YYYY-MM-DD') AS starts_on, to_char(ends_on, 'YYYY-MM-DD') AS ends_on FROM rentals.leases WHERE status = 'active'")).rows
  const now = new Date().toISOString().slice(0, 7)
  for (const l of leases) {
    let p = l.starts_on.slice(0, 7); const last = l.ends_on && l.ends_on.slice(0, 7) < now ? l.ends_on.slice(0, 7) : now
    let guard = 0
    while (p <= last && guard++ < 240) {
      await db().query('INSERT INTO rentals.rent_charges (lease_id, period, due_on, amount) VALUES ($1,$2,$3,$4) ON CONFLICT (lease_id, period) DO NOTHING', [l.id, p, p + '-' + String(l.due_day).padStart(2, '0'), l.rent])
      const d = new Date(p + '-01T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() + 1); p = d.toISOString().slice(0, 7)
    }
  }
}
export const rentStatus = (c: { amount: number; paid_amount: number | null; due_on: string }) => (c.paid_amount !== null && c.paid_amount >= c.amount - 0.005 ? 'paid' : c.paid_amount ? 'partial' : c.due_on < new Date().toISOString().slice(0, 10) ? 'overdue' : 'due')

// ── Recurring expenses (repeat monthly) ───────────────────────────────────────────────────────────────────────────
export async function runRecurringExpenses(): Promise<number> {
  const tpl = (await db().query<{ id: string; spent_on: string }>("SELECT id, to_char(spent_on, 'YYYY-MM-DD') AS spent_on FROM rentals.expenses WHERE recurring AND recurred_from IS NULL")).rows
  const today = new Date().toISOString().slice(0, 10); let n = 0
  for (const t of tpl) {
    const day = Math.min(Number(t.spent_on.slice(8, 10)), 28)
    let d = new Date(t.spent_on.slice(0, 7) + '-01T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() + 1)
    let guard = 0
    while (guard++ < 120) {
      const on = d.toISOString().slice(0, 7) + '-' + String(day).padStart(2, '0'); if (on > today) break
      const x = await db().query(`INSERT INTO rentals.expenses (organization_id, property_id, unit_id, category, item, quantity, vendor, amount, spent_on, recurring, recurred_from, notes, created_by)
        SELECT organization_id, property_id, unit_id, category, item, quantity, vendor, amount, $2::date, false, id, notes, created_by FROM rentals.expenses e WHERE e.id = $1 AND NOT EXISTS (SELECT 1 FROM rentals.expenses x WHERE x.recurred_from = $1 AND to_char(x.spent_on, 'YYYY-MM') = $3)`, [t.id, on, on.slice(0, 7)])
      n += x.rowCount ?? 0; d.setUTCMonth(d.getUTCMonth() + 1)
    }
  }
  return n
}

// ── iCal calendars ────────────────────────────────────────────────────────────────────────────────────────────────
export function parseIcal(text: string): { uid: string; starts: string; ends: string; kind: 'reserved' | 'blocked'; code: string | null; summary: string }[] {
  const lines = text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/)
  const out: { uid: string; starts: string; ends: string; kind: 'reserved' | 'blocked'; code: string | null; summary: string }[] = []
  let ev: Record<string, string> | null = null
  const d = (v: string | undefined) => { const m = (v ?? '').match(/(\d{4})(\d{2})(\d{2})/); return m ? m[1] + '-' + m[2] + '-' + m[3] : '' }
  for (const l of lines) {
    if (l === 'BEGIN:VEVENT') ev = {}
    else if (l === 'END:VEVENT' && ev) { const s = d(ev.DTSTART), e = d(ev.DTEND); if (s && e) { const summary = ev.SUMMARY ?? ''; out.push({ uid: ev.UID || s + e, starts: s, ends: e, kind: /reserved/i.test(summary) ? 'reserved' : 'blocked', code: (ev.DESCRIPTION ?? '').match(/details\/([A-Z0-9]{8,12})/)?.[1] ?? null, summary: summary.slice(0, 200) }) } ev = null }
    else if (ev) { const i = l.indexOf(':'); if (i > 0) ev[l.slice(0, i).split(';')[0]!] = l.slice(i + 1).replace(/\\n/g, '\n').replace(/\\,/g, ',') }
  }
  return out
}
export async function syncCalendars(): Promise<number> {
  const units = (await db().query<{ id: string; property_id: string; name: string; ical_url: string }>("SELECT id, property_id, name, ical_url FROM rentals.units WHERE active AND ical_url IS NOT NULL AND ical_url <> ''")).rows
  let n = 0
  for (const u of units) {
    try {
      const text = await $fetch<string>(u.ical_url, { responseType: 'text', timeout: 15000 })
      const evs = parseIcal(text)
      const old = new Set((await db().query<{ uid: string }>("SELECT uid FROM rentals.calendar WHERE unit_id = $1 AND kind = 'reserved'", [u.id])).rows.map((r) => r.uid))
      await db().query('DELETE FROM rentals.calendar WHERE unit_id = $1', [u.id])
      for (const e of evs) {
        await db().query('INSERT INTO rentals.calendar (unit_id, uid, starts, ends, kind, confirmation_code, summary) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING', [u.id, e.uid.slice(0, 300), e.starts, e.ends, e.kind, e.code, e.summary])
        if (e.kind === 'reserved' && old.size && !old.has(e.uid.slice(0, 300)) && e.ends >= new Date().toISOString().slice(0, 10)) await db().query('INSERT INTO rentals.activity (property_id, unit_id, event, detail) VALUES ($1,$2,$3,$4)', [u.property_id, u.id, 'New booking', u.name + ' · ' + e.starts + ' → ' + e.ends + (e.code ? ' · ' + e.code : '')])
      }
      await db().query('UPDATE rentals.units SET ical_synced_at = now() WHERE id = $1', [u.id]); n++
    } catch (err) { console.error('[rentals] ical', u.name, (err as Error).message) }
  }
  return n
}

// ── Public listing refresh (title, photo, rating, reviews): read-only, once a day, our own listings only ──────────────
export function parseListingHtml(html: string): { title: string | null; image: string | null; rating: number | null; reviews: number | null } {
  const meta = (p: string) => html.match(new RegExp('<meta[^>]+(?:property|name)="' + p + '"[^>]+content="([^"]*)"', 'i'))?.[1] ?? html.match(new RegExp('<meta[^>]+content="([^"]*)"[^>]+(?:property|name)="' + p + '"', 'i'))?.[1] ?? null
  const dec = (s: string | null) => (s ? s.replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>') : s)
  const og = dec(meta('og:title')), desc = dec(meta('og:description')), title = dec(html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? null)
  const star = (og ?? '').match(/★\s*([0-9.]+)/)?.[1] ?? html.match(/"(?:starRating|guestSatisfactionOverall|avgRating)"\s*:\s*([0-9.]+)/)?.[1] ?? html.match(/([0-9]\.[0-9]{1,2}) out of 5/)?.[1]
  const rev = html.match(/"reviewCount"\s*:\s*"?(\d+)/)?.[1] ?? html.match(/(\d+)\s+reviews?/i)?.[1]
  const name = (title ?? '').split(/\s+[-|·]\s+/)[0]?.trim() || desc || null
  const rating = star ? Number(star) : null
  return { title: name && !/^airbnb/i.test(name) ? name.slice(0, 200) : null, image: dec(meta('og:image')), rating: rating && rating <= 5 ? rating : null, reviews: rev ? Number(rev) : null }
}
export async function refreshListings(): Promise<number> {
  const units = (await db().query<{ id: string; property_id: string; name: string; airbnb_listing_id: string; title: string | null; rating: string | null; review_count: number | null; image_url: string | null }>("SELECT id, property_id, name, airbnb_listing_id, title, rating::text, review_count, image_url FROM rentals.units WHERE active AND airbnb_listing_id IS NOT NULL AND (refreshed_at IS NULL OR refreshed_at < now() - interval '20 hours')")).rows
  let n = 0
  for (const u of units) {
    try {
      const html = await $fetch<string>('https://www.airbnb.com/rooms/' + u.airbnb_listing_id, { responseType: 'text', timeout: 20000, headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36', 'accept-language': 'en-US,en;q=0.9' } })
      const p = parseListingHtml(html)
      const changes: string[] = []
      if (p.rating !== null && u.rating !== null && Number(u.rating) !== p.rating) changes.push('rating ' + Number(u.rating).toFixed(2) + ' → ' + p.rating.toFixed(2))
      if (p.reviews !== null && u.review_count !== null && p.reviews > u.review_count) changes.push((p.reviews - u.review_count) + ' new review' + (p.reviews - u.review_count === 1 ? '' : 's'))
      if (p.title && u.title && p.title !== u.title) changes.push('title changed to "' + p.title + '"')
      await db().query('UPDATE rentals.units SET title = coalesce($2, title), image_url = coalesce(image_url, $3), rating = coalesce($4, rating), review_count = coalesce($5, review_count), refreshed_at = now(), refresh_error = NULL WHERE id = $1', [u.id, p.title, p.image, p.rating, p.reviews])
      if (changes.length) await db().query('INSERT INTO rentals.activity (property_id, unit_id, event, detail) VALUES ($1,$2,$3,$4)', [u.property_id, u.id, 'Listing update', u.name + ': ' + changes.join(', ')])
      n++
    } catch (err) { await db().query('UPDATE rentals.units SET refreshed_at = now(), refresh_error = $2 WHERE id = $1', [u.id, String((err as Error).message).slice(0, 300)]) }
  }
  return n
}

// ── Month figures ─────────────────────────────────────────────────────────────────────────────────────────────────
export interface UnitMonth { unit_id: string; income: number; gross: number; fees: number; adjustments: number; tax: number; rent: number; nights: number; nights_source: 'report' | 'bookings'; days: number }
const overlap = (a1: string, a2: string, b1: string, b2: string) => { const s = a1 > b1 ? a1 : b1, e = a2 < b2 ? a2 : b2; return s < e ? Math.round((Date.parse(e) - Date.parse(s)) / 86400000) : 0 }
// Periods: a month (2026-09), a quarter (2026-Q3) or a year (2026).
export const PERIOD_RE = /^20\d{2}(-[01]\d|-Q[1-4])?$/
export const lastMonth = () => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 7) }
export function periodMonths(p: string): string[] {
  if (/^\d{4}$/.test(p)) return Array.from({ length: 12 }, (_, i) => p + '-' + String(i + 1).padStart(2, '0'))
  const q = p.match(/^(\d{4})-Q([1-4])$/); if (q) return [0, 1, 2].map((i) => q[1] + '-' + String((Number(q[2]) - 1) * 3 + i + 1).padStart(2, '0'))
  return [p]
}
export const rentalLabel = (p: string) => (/^\d{4}$/.test(p) ? 'Year ' + p : /-Q\d$/.test(p) ? p.slice(5) + ' ' + p.slice(0, 4) : monthLabel(p))
export function rentalRange(p: string): { from: string; to: string; next: string; days: number } {
  const qm = p.match(/^(\d{4})-Q([1-4])$/)
  if (qm) { const ms = periodMonths(p); const a = rentalRange(ms[0]!), b = rentalRange(ms[2]!); return { from: a.from, to: b.to, next: b.next, days: Math.round((Date.parse(b.next) - Date.parse(a.from)) / 86400000) } }
  if (/^\d{4}$/.test(p)) return { from: p + '-01-01', to: p + '-12-31', next: (Number(p) + 1) + '-01-01', days: (Date.parse((Number(p) + 1) + '-01-01') - Date.parse(p + '-01-01')) / 86400000 }
  const d = new Date(p + '-01T00:00:00Z'), n = new Date(d); n.setUTCMonth(n.getUTCMonth() + 1)
  const next = n.toISOString().slice(0, 10), to = new Date(n.getTime() - 86400000).toISOString().slice(0, 10)
  return { from: p + '-01', to, next, days: Math.round((n.getTime() - d.getTime()) / 86400000) }
}
export async function unitFigures(period: string): Promise<Map<string, UnitMonth>> {
  const { from, to, next, days } = rentalRange(period)
  const units = (await db().query<{ id: string }>('SELECT id FROM rentals.units WHERE active')).rows
  const m = new Map<string, UnitMonth>(units.map((u) => [u.id, { unit_id: u.id, income: 0, gross: 0, fees: 0, adjustments: 0, tax: 0, rent: 0, nights: 0, nights_source: 'bookings' as const, days }]))
  const tx = (await db().query<{ unit_id: string; type: string; amount: string | null; gross: string | null; service_fee: string | null; remitted_tax: string | null }>(
    "SELECT unit_id, type, amount::text, gross::text, service_fee::text, remitted_tax::text FROM rentals.transactions WHERE unit_id IS NOT NULL AND type NOT ILIKE 'payout' AND txn_date BETWEEN $1 AND $2", [from, to])).rows
  for (const t of tx) { const x = m.get(t.unit_id); if (!x) continue; x.income += Number(t.amount ?? 0); if (/^reservation$/i.test(t.type)) { x.gross += Number(t.gross ?? 0); x.fees += Number(t.service_fee ?? 0) } else { x.adjustments += Number(t.amount ?? 0); const af = adjFee({ type: t.type, service_fee: t.service_fee === null ? null : Number(t.service_fee) }); x.gross -= af; x.fees -= af } x.tax += Number(t.remitted_tax ?? 0) }
  const rent = (await db().query<{ unit_id: string; v: string }>('SELECT l.unit_id, sum(c.paid_amount)::text AS v FROM rentals.rent_charges c JOIN rentals.leases l ON l.id = c.lease_id WHERE c.paid_on BETWEEN $1 AND $2 GROUP BY l.unit_id', [from, to])).rows
  for (const r of rent) { const x = m.get(r.unit_id); if (x) { x.rent += Number(r.v); x.income += Number(r.v) } }
  // Nights booked: bookings (CSV, by confirmation code) and iCal reservations, by date overlap with the period.
  const stays = (await db().query<{ unit_id: string; code: string | null; ci: string; co: string }>(`SELECT unit_id, confirmation_code AS code, to_char(min(check_in), 'YYYY-MM-DD') AS ci, to_char(max(check_out), 'YYYY-MM-DD') AS co FROM rentals.transactions
      WHERE unit_id IS NOT NULL AND type ILIKE 'reservation' AND check_in < $2 AND check_out > $1 GROUP BY unit_id, confirmation_code
    UNION ALL SELECT unit_id, confirmation_code, to_char(starts, 'YYYY-MM-DD'), to_char(ends, 'YYYY-MM-DD') FROM rentals.calendar WHERE kind = 'reserved' AND starts < $2 AND ends > $1`, [from, next])).rows
  const seen = new Set<string>()
  for (const s of stays) { const k = s.unit_id + ':' + (s.code ?? s.ci); if (s.code && seen.has(k)) continue; seen.add(k); const x = m.get(s.unit_id); if (x) x.nights += overlap(s.ci, s.co, from, next) }
  // A month with an Earnings report: its nights per home are authoritative.
  if (/^\d{4}-\d{2}$/.test(period)) {
    // Only a report for exactly this month (an import can hold several reports, e.g. a year and a month).
    const saved = (await db().query<{ control: Control | Control[] }>("SELECT control FROM rentals.imports WHERE status = 'saved' AND control IS NOT NULL ORDER BY saved_at DESC LIMIT 200")).rows
    const c = saved.flatMap((x) => (Array.isArray(x.control) ? x.control : [x.control])).find((x) => x.period_start.slice(0, 7) === period && x.period_end.slice(0, 7) === period)
    if (c) { const all = await allUnits(); for (const h of c.homes) { const u = matchUnit(all, h.name); const x = u ? m.get(u.id) : undefined; if (x && h.nights !== null) { x.nights = h.nights; x.nights_source = 'report' } } }
  }
  for (const x of m.values()) { x.nights = Math.min(x.nights, days); for (const k of ['income', 'gross', 'fees', 'adjustments', 'tax', 'rent'] as const) x[k] = r2(x[k]) }
  return m
}
// property_id null = shared across all properties (e.g. rent, software, bank fees from the bank).
export async function expensesBy(period: string): Promise<{ property_id: string | null; unit_id: string | null; category: string; v: number }[]> {
  const { from, to } = rentalRange(period)
  return (await db().query<{ property_id: string | null; unit_id: string | null; category: string; v: string }>('SELECT property_id, unit_id, category, sum(amount)::text AS v FROM rentals.expenses WHERE spent_on BETWEEN $1 AND $2 GROUP BY property_id, unit_id, category', [from, to])).rows.map((r) => ({ ...r, v: Number(r.v) }))
}
export const prevPeriod = (p: string) => { if (/^\d{4}$/.test(p)) return String(Number(p) - 1); const q = p.match(/^(\d{4})-Q([1-4])$/); if (q) return q[2] === '1' ? (Number(q[1]) - 1) + '-Q4' : q[1] + '-Q' + (Number(q[2]) - 1); const d = new Date(p + '-01T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 7) }

// ── P&L ───────────────────────────────────────────────────────────────────────────────────────────────────────────
export interface Pnl { title: string; period: string; label: string; gross: number; adjustments: number; fees: number; airbnb_net: number; rent: number; books_income?: number; income: number; tax: number; expenses: { category: string; label: string; v: number }[]; expense_total: number; profit: number; nights: number }
export async function pnl(period: string, propertyId: string | null): Promise<Pnl> {
  const props = (await db().query<{ id: string; name: string }>('SELECT id, name FROM rentals.properties WHERE active AND ($1::uuid IS NULL OR id = $1) ORDER BY sort', [propertyId])).rows
  const units = (await allUnits()).filter((u) => props.some((p) => p.id === u.property_id))
  const months = periodMonths(period)
  const t = { gross: 0, adjustments: 0, fees: 0, airbnb: 0, rent: 0, tax: 0, nights: 0 }
  for (const mo of months) {
    const f = await unitFigures(mo)
    for (const u of units) { const x = f.get(u.id); if (!x) continue; t.gross += x.gross; t.adjustments += x.adjustments; t.fees += x.fees; t.airbnb += x.income - x.rent; t.rent += x.rent; t.tax += x.tax; t.nights += x.nights }
  }
  const cats = new Map((await db().query<{ code: string; label: string }>('SELECT code, label FROM rentals.expense_categories ORDER BY sort')).rows.map((c) => [c.code, c.label]))
  // Shared costs (no property) count in full for all properties together, and by share of units for one property.
  const allUnits_ = (await db().query<{ n: number }>('SELECT count(*)::int AS n FROM rentals.units u JOIN rentals.properties p ON p.id = u.property_id WHERE u.active AND p.active')).rows[0]?.n || 1
  const share = propertyId ? units.length / allUnits_ : 1
  const ex = (await expensesBy(period)).filter((e) => (e.property_id === null) || props.some((p) => p.id === e.property_id)).map((e) => (e.property_id === null ? { ...e, v: e.v * share } : e))
  const byCat = new Map<string, number>(); for (const e of ex) byCat.set(e.category, (byCat.get(e.category) ?? 0) + e.v)
  // Combined report: months with no Airbnb rows / no logged expenses take those figures from the monthly books.
  let booksIncome = 0
  if (!propertyId) {
    const books = await booksMonths(), live = await rentalMonths(), bankAir = await bankAirbnbMonths()
    for (const mo of months) { const b = books.get(mo); if (!live.income.has(mo)) booksIncome += bankAir.get(mo) ?? b?.income ?? 0; if (b && !live.expenses.has(mo)) byCat.set('__books', (byCat.get('__books') ?? 0) + b.expenses) }
  }
  const expenses = [...byCat.entries()].map(([category, v]) => ({ category, label: category === '__books' ? 'Operating costs from the monthly books (months not itemised here)' : cats.get(category) ?? category, v: r2(v) })).sort((a, b) => b.v - a.v)
  const expense_total = r2(expenses.reduce((s, e) => s + e.v, 0)), income = r2(t.airbnb + t.rent + booksIncome)
  return { title: props.length === 1 ? props[0]!.name : 'All properties', period, label: rentalLabel(period), gross: r2(t.gross), adjustments: r2(t.adjustments), fees: r2(t.fees), airbnb_net: r2(t.airbnb), rent: r2(t.rent), books_income: r2(booksIncome), income, tax: r2(t.tax), expenses, expense_total, profit: r2(income - expense_total), nights: t.nights }
}
export function pnlCsv(p: Pnl): string {
  const q = (s: string | number) => (typeof s === 'number' ? s.toFixed(2) : '"' + s.replace(/"/g, '""') + '"')
  const rows: [string, string | number][] = [['Property', p.title], ['Period', p.label], ['Airbnb gross earnings', p.gross], ['Adjustments', p.adjustments], ['Airbnb service fees', -p.fees], ['Airbnb net earnings', p.airbnb_net], ['Rent received', p.rent], ...(p.books_income ? [['Airbnb deposits in the bank / monthly books (months without Airbnb files)', p.books_income] as [string, number]] : []), ['Total income', p.income],
    ...p.expenses.map((e) => ['Expense: ' + e.label, -e.v] as [string, number]), ['Total expenses', -p.expense_total], ['Profit', p.profit], ['Airbnb remitted taxes (collected and paid by Airbnb, not income)', p.tax], ['Nights booked', String(p.nights)]]
  return 'Line,Amount (USD)\n' + rows.map((r) => q(r[0]) + ',' + (typeof r[1] === 'number' ? r[1].toFixed(2) : q(r[1]))).join('\n') + '\n'
}

// ── Before the Airbnb imports: Aidi Haven's monthly books ─────────────────────────────────────────────────────────
// Months with no Airbnb rows or logged expenses here fall back to the entity's monthly income statements (Financials,
// cash basis from the reconciled Chase + Baselane statements): income = revenue, expenses = cost of sales + opex.
export async function booksMonths(): Promise<Map<string, { income: number; expenses: number }>> {
  const ent = await havenEntityId(); if (!ent) return new Map()
  const rows = (await db().query<{ p: string; lines: Record<string, number | null> }>("SELECT to_char(period_end, 'YYYY-MM') AS p, lines FROM financials.statements WHERE entity_id = $1 AND period_type = 'month' ORDER BY period_end", [ent])).rows
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
  return new Map(rows.map((r) => [r.p, { income: r2(n(r.lines.revenue)), expenses: r2(n(r.lines.cogs) + n(r.lines.opex_total)) }]))
}
// Months that have Airbnb rows (or rent) here, and months that have logged expenses. A month uses the books for
// whichever side is missing, so importing past Airbnb CSVs never shows a month with income and no costs.
export async function rentalMonths(): Promise<{ income: Set<string>; expenses: Set<string> }> {
  const inc = (await db().query<{ p: string }>("SELECT DISTINCT to_char(txn_date, 'YYYY-MM') AS p FROM rentals.transactions UNION SELECT period FROM rentals.rent_charges WHERE paid_on IS NOT NULL")).rows.map((r) => r.p)
  const ex = (await db().query<{ p: string }>("SELECT DISTINCT to_char(spent_on, 'YYYY-MM') AS p FROM rentals.expenses")).rows.map((r) => r.p)
  return { income: new Set(inc), expenses: new Set(ex) }
}
// Date ranges where Aidi Haven's bank accounts have transaction-level statements (not just monthly totals): a payout
// can only "need attention" when the bank detail for its arrival date is in the system.
export async function bankDetailRanges(): Promise<{ from: string; to: string }[]> {
  const ent = await havenEntityId()
  return (await db().query<{ from: string; to: string }>(`SELECT to_char(s.period_start, 'YYYY-MM-DD') AS "from", to_char(s.period_end, 'YYYY-MM-DD') AS "to" FROM banking.statements s JOIN banking.accounts a ON a.id = s.account_id
    WHERE ($1::uuid IS NULL OR a.entity_id = $1) AND EXISTS (SELECT 1 FROM banking.transactions t WHERE t.statement_id = s.id)`, [ent])).rows
}
export const covered = (ranges: { from: string; to: string }[], d: string) => ranges.some((r) => d >= r.from && d <= r.to)
// Airbnb payouts as they reached Aidi Haven's bank (deposits mentioning Airbnb), by month: the income for months
// without an Airbnb CSV here, ahead of the books.
export async function bankAirbnbMonths(): Promise<Map<string, number>> {
  const ent = await havenEntityId()
  const rows = (await db().query<{ p: string; v: string }>(`SELECT to_char(t.txn_date, 'YYYY-MM') AS p, sum(t.amount)::text AS v FROM banking.transactions t JOIN banking.accounts a ON a.id = t.account_id
    WHERE ($1::uuid IS NULL OR a.entity_id = $1) AND t.amount > 0 AND t.description ILIKE '%airbnb%' GROUP BY 1`, [ent])).rows
  return new Map(rows.map((r) => [r.p, r2(Number(r.v))]))
}
