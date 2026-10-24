// Exports, site-wide. Files that pull a lot of data are built a few at a time per server and a limited number of times
// per person, so a burst of downloads cannot slow the site for everyone (server/middleware/04.exports.ts guards every
// download route). Data that spans time downloads at most a month at once; longer ranges (up to a year) are built in
// the background and emailed as a link that works for a week, for that person only.
import type { H3Event } from 'h3'
export const EXPORT_MAX = 3
export const DIRECT_DAYS = 31, EMAIL_DAYS = 366
let running = 0
export function exportSlotTake(): boolean { if (running >= EXPORT_MAX) return false; running++; return true }
export function exportSlotGive() { running = Math.max(0, running - 1) }

type Cell = string | number | null
export interface Built { name: string; sheets: { name: string; headers: string[]; rows: Cell[][]; money?: number[] }[] }
interface Kind { label: string; ranged: boolean; build: (event: H3Event, from: string | null, to: string | null) => Promise<Built> }
const scopeName = async (event: H3Event) => { const sc = await forecastScope(event); return { sc, title: sc.name } }

export const EXPORTS: Record<string, Kind> = {
  // Every bank payment in the period, in its own currency and the view's.
  bank_transactions: { label: 'Bank transactions', ranged: true, build: async (event, from, to) => {
    const { sc, title } = await scopeName(event), main = await companyEntityId(), rate = await rateTo(sc.currency)
    const r = (await db().query<{ d: string; account: string | null; vendor: string; description: string; direction: string; amount: number; currency: string; category: string | null; category_by: string; source: string; company: string | null }>(
      `SELECT l.txn_date::text AS d, l.account_label AS account, l.vendor, l.description, l.direction, l.amount::float, l.currency, l.category, l.category_by, l.source, e.name AS company
         FROM banking.ledger l LEFT JOIN core.entities e ON e.id = coalesce(l.entity_id, $4::uuid)
        WHERE l.txn_date BETWEEN $1 AND $2 AND ($3::uuid IS NULL OR coalesce(l.entity_id, $4::uuid) = $3) ORDER BY l.txn_date, l.created_at LIMIT 200000`, [from, to, sc.group ? null : sc.entity, main])).rows
    const cats = new Map(STD_CATS.map((c) => [c.key, c.label])), cat = (k: string | null) => (k ? cats.get(k) ?? k.replace(/^cat:[a-z_]+:/, '') : '')
    const BY: Record<string, string> = { auto: 'Suggested', ai: 'AI', rule: 'Your rule', manual: 'Set by you' }
    const rows: Cell[][] = []
    for (const x of r) { const s = x.direction === 'out' ? -1 : 1; rows.push([x.d, ...(sc.group ? [x.company] : []), x.account, x.vendor, x.description, s * x.amount, x.currency, Math.round(s * x.amount * await rate(x.currency) * 100) / 100, cat(x.category), BY[x.category_by] ?? x.category_by, x.source === 'bank_feed' ? 'Bank feed' : 'Statement or sheet']) }
    const headers = ['Date', ...(sc.group ? ['Company'] : []), 'Account', 'Vendor', 'Description', 'Amount', 'Currency', 'Amount in ' + sc.currency, 'Category', 'Category from', 'Source']
    const mi = headers.indexOf('Amount')
    return { name: title + ' bank transactions ' + from + ' to ' + to, sheets: [{ name: 'Transactions', headers, rows, money: [mi, mi + 2] }] }
  } },
  // Money out by category and month, and by vendor, for the period (transfers between own accounts left out).
  bank_spend: { label: 'Spend by category', ranged: true, build: async (event, from, to) => {
    const { sc, title } = await scopeName(event), main = await companyEntityId(), rate = await rateTo(sc.currency)
    const r = (await db().query<{ m: string; category: string | null; vendor: string; currency: string; amt: number }>(
      `SELECT to_char(txn_date, 'YYYY-MM') AS m, category, vendor, currency, sum(amount)::float AS amt FROM banking.ledger
        WHERE direction = 'out' AND coalesce(category, '') NOT IN ('transfer', 'investment') AND txn_date BETWEEN $1 AND $2 AND ($3::uuid IS NULL OR coalesce(entity_id, $4::uuid) = $3) GROUP BY 1, 2, 3, 4`, [from, to, sc.group ? null : sc.entity, main])).rows
    const cats = new Map(STD_CATS.map((c) => [c.key, c.label])), cat = (k: string | null) => (k ? cats.get(k) ?? k.replace(/^cat:[a-z_]+:/, '') : 'Uncategorised')
    const months = [...new Set(r.map((x) => x.m))].sort(), byCat = new Map<string, Record<string, number>>(), byVen = new Map<string, { cat: string; total: number }>()
    for (const x of r) { const v = x.amt * await rate(x.currency), c = cat(x.category), o = byCat.get(c) ?? {}; o[x.m] = (o[x.m] ?? 0) + v; byCat.set(c, o); const vv = byVen.get(x.vendor) ?? { cat: c, total: 0 }; vv.total += v; byVen.set(x.vendor, vv) }
    const r2 = (n: number) => Math.round(n * 100) / 100
    const catRows = [...byCat].map(([c, o]) => [c, ...months.map((m) => r2(o[m] ?? 0)), r2(Object.values(o).reduce((a, b) => a + b, 0))] as Cell[]).sort((a, b) => Number(b[b.length - 1]) - Number(a[a.length - 1]))
    const venRows = [...byVen].sort((a, b) => b[1].total - a[1].total).map(([v, x]) => [v, x.cat, r2(x.total)] as Cell[])
    return { name: title + ' spend ' + from + ' to ' + to, sheets: [
      { name: 'By category', headers: ['Category (' + sc.currency + ')', ...months, 'Total'], rows: catRows, money: Array.from({ length: months.length + 1 }, (_, i) => i + 1) },
      { name: 'By vendor', headers: ['Vendor', 'Category', 'Total (' + sc.currency + ')'], rows: venRows, money: [2] }] }
  } },
  // The cut list as it stands today (no period).
  bank_cut_list: { label: 'Cut list', ranged: false, build: async (event) => {
    const { sc, title } = await scopeName(event), t = await treasuryView(sc)
    const cat = (k: string | null) => t.categories.find((c) => c.key === k)?.label ?? k ?? ''
    const FLAG: Record<string, string> = { keep: 'Keep', to_cancel: 'Cut', downgrade: 'Downgrade', review: 'Review', personal: 'Personal', cancelled: 'Cancelled' }
    return { name: title + ' cut list ' + new Date().toISOString().slice(0, 10), sheets: [{ name: 'Cut list', headers: ['Payee', 'Category', 'A month (' + t.currency + ')', 'Flag', 'Saving %', 'Saves a month', 'Last paid', 'Action'],
      rows: t.cut_list.map((v) => [v.name, cat(v.category), v.monthly, FLAG[v.status] ?? v.status, v.saving_pct, v.saving, v.last, v.note ?? '']), money: [2, 5] }] }
  } }
}

export async function toFile(b: Built, format: 'xlsx' | 'csv'): Promise<{ bytes: Uint8Array; mime: string; file: string }> {
  const safe = b.name.replace(/[^A-Za-z0-9 ._()-]/g, '').slice(0, 120)
  if (format === 'csv') {
    const q = (v: Cell) => (v === null ? '' : typeof v === 'number' ? String(v) : '"' + String(v).replaceAll('"', '""') + '"')
    const s = b.sheets[0]!
    return { bytes: new TextEncoder().encode('﻿' + [s.headers.map(q).join(','), ...s.rows.map((r) => r.map(q).join(','))].join('\n')), mime: 'text/csv; charset=utf-8', file: safe + '.csv' }
  }
  const { default: Excel } = await import('exceljs')
  const wb = new Excel.Workbook()
  for (const s of b.sheets) {
    const ws = wb.addWorksheet(s.name.slice(0, 31))
    ws.addRow(s.headers).eachCell((c) => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0C1A2E' } } })
    for (const r of s.rows) { const row = ws.addRow(r); for (const i of s.money ?? []) row.getCell(i + 1).numFmt = '#,##0.00' }
    ws.columns.forEach((c, i) => (c.width = Math.min(48, Math.max(10, s.headers[i]?.length ?? 10, ...s.rows.slice(0, 200).map((r) => String(r[i] ?? '').length)) + 2)))
    ws.views = [{ state: 'frozen', ySplit: 1 }]
  }
  return { bytes: new Uint8Array(await wb.xlsx.writeBuffer()), mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', file: safe + '.xlsx' }
}

const DAY = 86400000
export function exportRange(kind: Kind, from: unknown, to: unknown, maxDays: number): { from: string | null; to: string | null } {
  if (!kind.ranged) return { from: null, to: null }
  const ok = (s: unknown) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s))
  if (!ok(from) || !ok(to)) throw apiError('invalid', 'Choose the dates to export.')
  const days = (Date.parse(to as string) - Date.parse(from as string)) / DAY + 1
  if (days < 1) throw apiError('invalid', 'The end date is before the start.')
  if (days > maxDays) throw apiError('too_long', maxDays === DIRECT_DAYS ? 'Downloads cover up to a month. Choose "Email me" for longer periods.' : 'Exports cover up to a year at a time.')
  return { from: from as string, to: to as string }
}
