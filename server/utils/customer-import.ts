// Reading a customer revenue file: one row per customer per month (Customer, Month, Revenue), or one row per customer
// with months across the columns. Optional columns: segment, sector, country, plan, start date, acquisition cost,
// gross margin. Plain parsing first; AI only when the layout is unclear, and to spot the same customer written two
// ways (within the file and against customers already saved).
import { z } from 'zod'
import { custKey } from '~/shared/customer-metrics'
import type { Cell, Grid } from './sheet-links'

export interface ParsedCust { name: string; segment?: string; sector?: string; country?: string; plan?: string; started_on?: string; acquisition_cost?: number; gross_margin_pct?: number; rev: Record<string, number>; rep?: Record<string, number> }
export interface Parsed { sheet: string; sheets?: { name: string; currency: string }[]; currency?: string; layout: 'long' | 'wide'; customers: ParsedCust[]; rows: number; repeated: number; skipped: number; months: string[]; ai_mapped: boolean; notes: string[] }
export interface DupGroup { names: string[]; to: string; reason: string; sure: boolean; existing: boolean }

type Attr = 'segment' | 'sector' | 'country' | 'plan' | 'started_on' | 'acquisition_cost' | 'gross_margin_pct'
const ATTR: [Attr, RegExp][] = [['segment', /^(segment|tier|size|customer type|type|category|class)/i], ['sector', /(sector|industry|vertical)/i], ['country', /^(country|region|market|geo|location)/i],
  ['plan', /^(plan|product|package|pricing|sku|service)/i], ['started_on', /(start|signed|since|onboard|first (invoice|payment)|joined|acquired on|go.?live)/i], ['acquisition_cost', /(cac|acquisition cost|cost to acquire)/i], ['gross_margin_pct', /(gross margin|gm ?%|margin)/i]]
const NAME = /^(customer|client|account|company|merchant|business|name|customer name|client name|account name|organisation|organization|partner)s?\b/i
const MONTH = /^(month|date|period|invoice date|billing (month|date|period)|transaction date|posted|paid on|payment date|year.?month|month start|billing cycle)/i
const CUR = /^(currency|ccy|cur\.?|curr)$/i
const AMOUNT = /(revenue|amount|mrr|arr|total|value|sales|billing|billed|invoice amount|income|net|fees?|paid|usd|ngn)/i
const TOTAL = /^(grand )?(sub)?total\b|^all customers$|^sum$/i

const txt = (c: Cell) => (c === null ? '' : String(c).trim())
function monthCell(c: Cell): string | null {
  const m = monthOf(c); if (m) return m
  const s = txt(c); const d = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(s)
  if (d) { const y = Number(d[3]!.length === 2 ? '20' + d[3] : d[3]); const mo = Number(d[1]) > 12 ? Number(d[2]) : Number(d[1]); return mo >= 1 && mo <= 12 ? y + '-' + String(mo).padStart(2, '0') : null }
  return null
}
function dateCell(c: Cell): string | undefined { const m = monthCell(c); if (!m) return undefined; const s = txt(c); return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : m + '-01' }
function setAttr(t: ParsedCust, a: Attr, c: Cell) {
  if (c === null || c === '') return
  if (a === 'started_on') { const d = dateCell(c); if (d) t.started_on = d; return }
  if (a === 'acquisition_cost') { const n = numOf(c); if (n !== null && n >= 0) t.acquisition_cost = n; return }
  if (a === 'gross_margin_pct') { const n = numOf(c); if (n !== null) t.gross_margin_pct = Math.abs(n) <= 1 && !String(c).includes('%') ? n * 100 : n; return }
  t[a] = txt(c).slice(0, a === 'sector' || a === 'plan' ? 80 : 60)
}

interface TMap { header: number; layout: 'long' | 'wide'; name: number; month: number; amount: number; monthCols: { col: number; month: string }[]; attrs: [Attr, number][]; cur?: number }
function guess(g: Grid): TMap | null {
  for (let h = 0; h < Math.min(12, g.rows.length); h++) {
    const row = g.rows[h] ?? []
    const heads = row.map(txt)
    const monthCols = row.map((c, i) => ({ col: i, month: monthCell(c) })).filter((x): x is { col: number; month: string } => !!x.month)
    const attrs: [Attr, number][] = []
    for (const [a, re] of ATTR) { const i = heads.findIndex((x, k) => x && re.test(x) && !monthCols.some((m) => m.col === k)); if (i >= 0 && !attrs.some(([, j]) => j === i)) attrs.push([a, i]) }
    if (monthCols.length >= 2) {
      let name = heads.findIndex((x) => NAME.test(x)); if (name < 0) name = heads.findIndex((x, i) => x && i < monthCols[0]!.col && !attrs.some(([, j]) => j === i))
      if (name >= 0) return { header: h, layout: 'wide', name, month: -1, amount: -1, monthCols, attrs: attrs.filter(([, i]) => i !== name) }
    }
    const name = heads.findIndex((x) => NAME.test(x)), month = heads.findIndex((x) => MONTH.test(x))
    let amount = heads.findIndex((x, i) => i !== name && i !== month && AMOUNT.test(x) && !/(count|qty|quantity|units|id|number|no\.?)$/i.test(x))
    if (amount < 0 && name >= 0 && month >= 0) amount = heads.findIndex((x, i) => i !== name && i !== month && x && g.rows.slice(h + 1, h + 20).some((r) => typeof numOf(r[i] ?? null) === 'number'))
    const cur = heads.findIndex((x) => CUR.test(x))
    if (name >= 0 && month >= 0 && amount >= 0) return { header: h, layout: 'long', name, month, amount, monthCols: [], attrs: attrs.filter(([, i]) => ![name, month, amount, cur].includes(i)), cur: cur >= 0 ? cur : undefined }
  }
  return null
}

const AiMapOut = z.object({ sheet: z.string(), header_row: z.number().int(), layout: z.enum(['long', 'wide', 'none']), customer_col: z.string(), month_col: z.string(), amount_col: z.string(), first_month_col: z.string(),
  segment_col: z.string(), sector_col: z.string(), country_col: z.string(), plan_col: z.string(), start_col: z.string(), cac_col: z.string(), margin_col: z.string() })
const colIdx = (s: string) => { const t = s.trim().toUpperCase(); if (!/^[A-Z]{1,3}$/.test(t)) return -1; let n = 0; for (const ch of t) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1 }
async function aiMap(grids: Grid[], ref: string): Promise<{ g: Grid; m: TMap } | null> {
  if (!useRuntimeConfig().anthropicApiKey) return null
  const L = (i: number) => { let s = '', n = i + 1; while (n) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26) } return s }
  const sample = grids.slice(0, 4).map((g) => '## ' + g.name + '\n' + g.rows.slice(0, 15).map((r, i) => (i + 1) + ': ' + r.slice(0, 30).map((c, j) => c === null ? '' : L(j) + '=' + String(c).slice(0, 40)).filter(Boolean).join(' | ')).join('\n')).join('\n\n')
  try {
    const { output } = await runAiTool({ task: 'customer_map', model: useRuntimeConfig().aiModelPitchScreen, promptVersion: 'customer-map-v1', inputRef: ref,
      system: 'You read spreadsheets of customer revenue. Find the sheet and columns. layout "long" = one row per customer per month (or per invoice) with a date column and an amount column; "wide" = one row per customer with months across the columns (give the first month column). Columns are letters; use "" when absent. header_row is the 1-based row with the headings. Use layout "none" if there is no customer revenue table.',
      user: sample, toolName: 'map_customers', toolDescription: 'Say where the customer revenue table is.', schema: AiMapOut, maxTokens: 600,
      jsonSchema: { type: 'object', additionalProperties: false, required: Object.keys(AiMapOut.shape), properties: Object.fromEntries(Object.keys(AiMapOut.shape).map((k) => [k, k === 'header_row' ? { type: 'integer' } : k === 'layout' ? { type: 'string', enum: ['long', 'wide', 'none'] } : { type: 'string' }])) } })
    if (output.layout === 'none') return null
    const g = grids.find((x) => x.name === output.sheet) ?? grids[0]!
    const header = Math.max(0, output.header_row - 1), name = colIdx(output.customer_col)
    if (name < 0) return null
    const attrs = ([['segment', output.segment_col], ['sector', output.sector_col], ['country', output.country_col], ['plan', output.plan_col], ['started_on', output.start_col], ['acquisition_cost', output.cac_col], ['gross_margin_pct', output.margin_col]] as [Attr, string][]).map(([a, c]) => [a, colIdx(c)] as [Attr, number]).filter(([, i]) => i >= 0)
    if (output.layout === 'wide') {
      const start = Math.max(colIdx(output.first_month_col), 0)
      const monthCols = (g.rows[header] ?? []).map((c, i) => ({ col: i, month: i >= start ? monthCell(c) : null })).filter((x): x is { col: number; month: string } => !!x.month)
      return monthCols.length ? { g, m: { header, layout: 'wide', name, month: -1, amount: -1, monthCols, attrs } } : null
    }
    const month = colIdx(output.month_col), amount = colIdx(output.amount_col)
    return month >= 0 && amount >= 0 ? { g, m: { header, layout: 'long', name, month, amount, monthCols: [], attrs } } : null
  } catch (e) { console.error('[customers] map', (e as Error).message); return null }
}

// Currencies: a column, the amount heading ("Amount (NGN)", "Revenue $"), or the tab's name ("Nigeria Data").
const COUNTRY: [RegExp, string][] = [[/nigeria|\bng\b|naira|lagos/i, 'NGN'], [/\b(us|usa|united states|dollar)\b/i, 'USD'], [/ghana/i, 'GHS'], [/kenya/i, 'KES'], [/south africa/i, 'ZAR'], [/\buk\b|united kingdom|britain/i, 'GBP'], [/euro|europe/i, 'EUR'], [/rwanda/i, 'RWF'], [/egypt/i, 'EGP'], [/uae|dubai|emirates/i, 'AED'], [/canada/i, 'CAD']]
function curOf(t: string): string | null {
  const s = t.trim(); const code = /\b(USD|NGN|GBP|EUR|KES|GHS|ZAR|RWF|EGP|AED|CAD|XOF|UGX|TZS)\b/i.exec(s); if (code) return code[1]!.toUpperCase()
  if (s.includes('₦')) return 'NGN'; if (s.includes('£')) return 'GBP'; if (s.includes('€')) return 'EUR'; if (/GH₵|GHC/i.test(s)) return 'GHS'; if (/KSh/i.test(s)) return 'KES'
  if (s === '$' || /\(\$\)|\$\s*$|^\$/.test(s)) return 'USD'
  return null
}
// Exchange rates in the file: a tab with a month and a rate (e.g. "Rate (₦ per $1)"), or Month | Currency | Rate.
// Returned as units of each currency per 1 USD, by month.
export function fileRates(grids: Grid[]): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>()
  const put = (cur: string, m: string, perUsd: number) => { if (!(perUsd > 0)) return; const x = out.get(cur) ?? new Map<string, number>(); x.set(m, perUsd); out.set(cur, x) }
  for (const g of grids.filter((x) => /(exchange|fx|rate)/i.test(x.name))) {
    for (let h = 0; h < Math.min(10, g.rows.length); h++) {
      const heads = (g.rows[h] ?? []).map(txt)
      const mc = heads.findIndex((x) => /^(month|period|date)/i.test(x)), rc = heads.findIndex((x) => /rate|per\s*\$|per\s*usd/i.test(x)), cc = heads.findIndex((x) => CUR.test(x))
      if (mc < 0 || rc < 0) continue
      const hc = curOf(heads[rc]!.replace(/per\s*\$\s*1|per\s*usd|per\s*1\s*usd/i, '')) // "Rate (₦ per $1)" → NGN per USD
      for (const r of g.rows.slice(h + 1)) {
        const m = monthCell(r[mc] ?? null), v = numOf(r[rc] ?? null); if (!m || v === null) continue
        const c = cc >= 0 ? (curOf(txt(r[cc] ?? null)) ?? txt(r[cc] ?? null).toUpperCase()) : hc
        if (c && c !== 'USD') put(c, m, v)
      }
      break
    }
  }
  return out
}
const DERIVED = /(top ?\d*|working|combined|summary|cohort|first seen|matrix|readme|detail|unique|pivot|report|dashboard|chart|analysis|assignment|variant|rate)/i
interface Pick { g: Grid; m: TMap; cur: string | null }
const AiPlanOut = z.object({ tables: z.array(z.object({ sheet: z.string(), currency: z.string() })), reason: z.string() })
// Which tabs hold the source rows (not totals, rankings or copies built from them), and their currencies.
async function aiPlan(cands: Pick[], ref: string): Promise<Pick[] | null> {
  if (!useRuntimeConfig().anthropicApiKey || cands.length < 2) return null
  const list = cands.map((c) => '## ' + c.g.name + ' (' + c.g.rows.length + ' rows, ' + Math.round((c.g.formulas ?? 0) * 100) + '% formulas)\n' + c.g.rows.slice(c.m.header, c.m.header + 6).map((r) => r.slice(0, 10).map((x) => (x === null ? '' : String(x).slice(0, 30))).join(' | ')).join('\n')).join('\n\n')
  try {
    const { output } = await runAiTool({ task: 'customer_plan', model: useRuntimeConfig().aiModelPitchScreen, promptVersion: 'customer-plan-v1', inputRef: ref,
      system: 'A workbook has several tables of customer revenue. Choose only the SOURCE tables (raw rows: one per customer per month or per transaction), never tables built from them (rankings, top 100, totals, combined or converted copies, working tabs), so nothing is counted twice. Give each chosen table its currency as an ISO code (or "" if not shown).',
      user: list, toolName: 'choose_tables', toolDescription: 'Choose the source tables and their currencies.', schema: AiPlanOut, maxTokens: 600,
      jsonSchema: { type: 'object', additionalProperties: false, required: ['tables', 'reason'], properties: { tables: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['sheet', 'currency'], properties: { sheet: { type: 'string' }, currency: { type: 'string' } } } }, reason: { type: 'string' } } } })
    const out = output.tables.map((t) => { const c = cands.find((x) => x.g.name === t.sheet); return c ? { ...c, cur: c.cur ?? (/^[A-Z]{3}$/.test(t.currency.toUpperCase()) ? t.currency.toUpperCase() : null) } : null }).filter((x): x is Pick => !!x)
    return out.length ? out : null
  } catch (e) { console.error('[customers] plan', (e as Error).message); return null }
}

// Read customer revenue from a workbook: every source table (several tabs, e.g. one per country, are added together),
// amounts converted to `target` at the file's own monthly rates when given, else the latest daily rate.
export async function parseCustomers(grids: Grid[], ref: string, target = 'USD'): Promise<Parsed> {
  const cands: Pick[] = []
  for (const g of grids) { const m = guess(g); if (m) cands.push({ g, m, cur: m.layout === 'long' ? curOf(txt((g.rows[m.header] ?? [])[m.amount] ?? null)) ?? COUNTRY.find(([re]) => re.test(g.name))?.[1] ?? null : COUNTRY.find(([re]) => re.test(g.name))?.[1] ?? null }) }
  let ai = false, picks: Pick[] = []
  if (cands.length) {
    // Prefer source tabs: not named like a report, and mostly typed values rather than formulas.
    const src = cands.filter((c) => !DERIVED.test(c.g.name) || /\bdata\b|raw|transactions?|invoices?|billing/i.test(c.g.name))
    const pool = src.length ? src : cands
    const low = pool.filter((c) => (c.g.formulas ?? 0) < 0.5)
    picks = (low.length ? low : pool)
    const longs = picks.filter((c) => c.m.layout === 'long')
    picks = longs.length ? longs : [picks.sort((a, b) => b.m.monthCols.length * b.g.rows.length - a.m.monthCols.length * a.g.rows.length)[0]!]
    if (picks.length > 1) { const p = await aiPlan(picks, ref); if (p) { picks = p; ai = true } }
  }
  if (!picks.length) { const p = await aiMap(grids, ref); if (p) { picks = [{ ...p, cur: null }]; ai = true } }
  if (!picks.length) throw apiError('unreadable', 'We could not find customer revenue in that file. Use one row per customer per month with the columns Customer, Month and Revenue (or months across the top), headings in the first row.', 422)
  const rates = fileRates(grids)
  const usdRates = await fxRates().then((r) => r.rates).catch(() => new Map<string, number>())
  const perUsd = (c: string, mo: string) => (c === 'USD' ? 1 : rates.get(c)?.get(mo) ?? [...(rates.get(c)?.entries() ?? [])].sort((a, b) => Math.abs(Number(a[0].replace('-', '')) - Number(mo.replace('-', ''))) - Math.abs(Number(b[0].replace('-', '')) - Number(mo.replace('-', ''))))[0]?.[1] ?? usdRates.get(c) ?? null)
  const used = new Set<string>(), missingRate = new Set<string>(), fromFile = new Set<string>()
  const conv = (amt: number, c: string | null, mo: string): number | null => {
    if (!c || c === target) return amt
    const a = perUsd(c, mo), b = perUsd(target, mo)
    if (!a || !b) { missingRate.add(c); return null }
    used.add(c); if (rates.get(c)?.has(mo) || rates.get(target)?.has(mo)) fromFile.add(c)
    return (amt / a) * b
  }
  const by = new Map<string, ParsedCust>(), seen = new Set<string>(), notes: string[] = []
  let rows = 0, repeated = 0, skipped = 0
  const get = (name: string) => { const k = name.toLowerCase(); let t = by.get(k); if (!t) { t = { name, rev: {} }; by.set(k, t) } return t }
  for (const { g, m, cur } of picks) {
    for (const r of g.rows.slice(m.header + 1)) {
      const name = txt(r[m.name] ?? null).replace(/\s+/g, ' ').slice(0, 200)
      if (!name || TOTAL.test(name) || /^[-–—.\s]+$/.test(name)) { if (name) skipped++; continue }
      if (m.layout === 'long') {
        const mo = monthCell(r[m.month] ?? null), raw = numOf(r[m.amount] ?? null)
        if (!mo || raw === null) { skipped++; continue }
        const rc = m.cur !== undefined ? curOf(txt(r[m.cur] ?? null)) ?? cur : cur
        const amt = conv(raw, rc, mo); if (amt === null) { skipped++; continue }
        const t = get(name)
        const sig = g.name + JSON.stringify(r); if (seen.has(sig)) { repeated++; t.rep = t.rep ?? {}; t.rep[mo] = Math.round(((t.rep[mo] ?? 0) + amt) * 100) / 100; continue } seen.add(sig)
        t.rev[mo] = Math.round(((t.rev[mo] ?? 0) + amt) * 100) / 100; rows++
        for (const [a, i] of m.attrs) setAttr(t, a, r[i] ?? null)
      } else {
        const t = by.get(name.toLowerCase()); if (t) repeated++
        const c = t ?? get(name); let any = false
        for (const { col, month } of m.monthCols) { const v0 = numOf(r[col] ?? null); const v = v0 === null ? null : conv(v0, cur, month); if (v !== null && v !== 0) { c.rev[month] = Math.round(((t ? c.rev[month] ?? 0 : 0) + v) * 100) / 100; any = true } }
        for (const [a, i] of m.attrs) setAttr(c, a, r[i] ?? null)
        if (any) rows++; else if (!t) { by.delete(name.toLowerCase()); skipped++ }
      }
    }
  }
  const customers = [...by.values()].filter((c) => Object.keys(c.rev).length)
  if (!customers.length) throw apiError('unreadable', 'No customer revenue was found under the headings. Check the month and amount columns.', 422)
  const months = [...new Set(customers.flatMap((c) => Object.keys(c.rev)))].sort()
  const m0 = picks[0]!.m
  if (picks.length > 1) notes.push('Read ' + picks.length + ' tables and added them together: ' + picks.map((p) => p.g.name + (p.cur ? ' (' + p.cur + ')' : '')).join(', ') + '. Tabs built from them (rankings, totals, combined copies) were left out so nothing is counted twice.')
  if (used.size) notes.push([...used].join(', ') + ' converted to ' + target + (fromFile.size ? ' at the monthly rates in the file' + (fromFile.size < used.size ? ' (the latest daily rate where the file has none)' : '') : ' at the latest daily rate') + '.')
  if (missingRate.size) notes.push('No exchange rate for ' + [...missingRate].join(', ') + '; those rows were skipped. Add an "Exchange rates" tab (Month, Currency, Rate per 1 USD).')
  if (repeated) notes.push(m0.layout === 'long' ? repeated + ' row' + (repeated === 1 ? ' was' : 's were') + ' exact repeats of another row (same customer, month, amount and every other column). They are left out unless you keep them.' : repeated + ' customer' + (repeated === 1 ? ' appears' : 's appear') + ' on more than one row; the rows were added together.')
  if (skipped) notes.push(skipped + ' row' + (skipped === 1 ? '' : 's') + ' without a customer, month or amount (or totals) were skipped.')
  if (customers.some((c) => Object.values(c.rev).some((v) => v < 0))) notes.push('Some months are negative (credits or refunds); they are kept as given.')
  return { sheet: picks.map((p) => p.g.name).join(', '), sheets: picks.map((p) => ({ name: p.g.name, currency: p.cur ?? target })), currency: target, layout: m0.layout, customers, rows, repeated, skipped, months, ai_mapped: ai, notes }
}

// The same customer written two ways: certain when the names match after removing case, punctuation and company
// suffixes (Ltd, Inc…); AI (or a close-spelling check without AI) suggests the rest for the founder to confirm.
const lev = (a: string, b: string) => { if (Math.abs(a.length - b.length) > 3) return 99; const d = Array.from({ length: b.length + 1 }, (_, i) => i); for (let i = 1; i <= a.length; i++) { let p = d[0]!; d[0] = i; for (let j = 1; j <= b.length; j++) { const t = d[j]!; d[j] = Math.min(d[j]! + 1, d[j - 1]! + 1, p + (a[i - 1] === b[j - 1] ? 0 : 1)); p = t } } return d[b.length]! }
const DupOut = z.object({ groups: z.array(z.object({ names: z.array(z.string()), keep: z.string(), reason: z.string(), confidence: z.enum(['high', 'medium']) })) })
export async function findDuplicates(incoming: string[], existing: string[], ref: string): Promise<DupGroup[]> {
  const exSet = new Set(existing), all = [...new Set([...existing, ...incoming])]
  const byKey = new Map<string, string[]>()
  for (const n of all) { const k = custKey(n); byKey.set(k, [...(byKey.get(k) ?? []), n]) }
  const out: DupGroup[] = []
  const inGroup = new Set<string>()
  for (const names of byKey.values()) if (names.length > 1) { const to = names.find((n) => exSet.has(n)) ?? names.slice().sort((a, b) => b.length - a.length)[0]!; out.push({ names, to, reason: 'Same name apart from case, punctuation or a company suffix', sure: true, existing: names.some((n) => exSet.has(n)) }); names.forEach((n) => inGroup.add(n)) }
  const keys = [...byKey.keys()]
  let suggested = false
  if (useRuntimeConfig().anthropicApiKey && keys.length > 1 && keys.length <= 3000) {
    try {
      const list = [...byKey.values()].map((ns) => ns[0]!)
      const { output } = await runAiTool({ task: 'customer_dupes', model: useRuntimeConfig().aiModelPitchScreen, promptVersion: 'customer-dupes-v1', inputRef: ref,
        system: 'You check a company\'s customer list for the same customer written in different ways: abbreviations (MTN vs MTN Nigeria Communications), typos, brand vs legal name, missing words, different spacing. Only group names you believe are the same paying customer; different subsidiaries or branches in different countries are NOT the same unless the names show it. Put the cleanest full name as keep. confidence high = clearly the same; medium = probably. Return no groups if there are none.',
        user: 'Customer names (one per line):\n' + list.slice(0, 3000).join('\n'), toolName: 'record_duplicates', toolDescription: 'Record groups of names that are the same customer.', schema: DupOut, maxTokens: 3000,
        jsonSchema: { type: 'object', additionalProperties: false, required: ['groups'], properties: { groups: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['names', 'keep', 'reason', 'confidence'], properties: { names: { type: 'array', items: { type: 'string' } }, keep: { type: 'string' }, reason: { type: 'string' }, confidence: { type: 'string', enum: ['high', 'medium'] } } } } } } })
      const known = new Set(all)
      for (const gr of output.groups) {
        const names = [...new Set(gr.names.flatMap((n) => byKey.get(custKey(n)) ?? (known.has(n) ? [n] : [])))]
        if (names.length < 2 || names.every((n) => inGroup.has(n))) continue
        const to = names.find((n) => exSet.has(n)) ?? (names.includes(gr.keep) ? gr.keep : names[0]!)
        out.push({ names, to, reason: gr.reason.slice(0, 200), sure: false, existing: names.some((n) => exSet.has(n)) }); names.forEach((n) => inGroup.add(n))
      }
      suggested = true
    } catch (e) { console.error('[customers] dupes', (e as Error).message) }
  }
  if (!suggested) {
    const ks = keys.filter((k) => k.length >= 4).slice(0, 2500)
    for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) {
      const a = ks[i]!, b = ks[j]!
      if (a.replace(/\D/g, '') !== b.replace(/\D/g, '')) continue // Branch 2 and Branch 3 are different customers
      const close = lev(a, b) <= (Math.min(a.length, b.length) >= 10 ? 2 : 1) || ((a.startsWith(b + ' ') || b.startsWith(a + ' ')) && Math.min(a.length, b.length) >= 5)
      if (!close) continue
      const names = [...byKey.get(a)!, ...byKey.get(b)!]
      if (names.every((n) => inGroup.has(n))) continue
      out.push({ names, to: names.find((n) => exSet.has(n)) ?? names.slice().sort((x, y) => y.length - x.length)[0]!, reason: 'Very similar spelling', sure: false, existing: names.some((n) => exSet.has(n)) }); names.forEach((n) => inGroup.add(n))
    }
  }
  return out.slice(0, 300)
}
