// The annual financial report: cover, contents, directors and professional advisers, report of the directors,
// accountants' report (only when the founder has one), accounting policies, balance sheet, statement of operations,
// changes in equity, cash flows and notes. Standard presentation built from the company's own figures, with the
// details only the founder knows (directors, CFO, offices, bankers, advisers) asked for and kept in settings.
import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { combine, deriveLines, type FinRow, type Lines } from '~/shared/fin-view'

export interface Person { name: string; role: string }
export interface Adviser { name: string; address: string }
export interface ReportProfile {
  legal_name: string; incorporated_on: string; jurisdiction: string; legal_form: string; principal_activities: string
  framework: 'us_gaap' | 'ifrs' | 'ifrs_sme'; fye_month: number
  directors: Person[]; secretary: string; cfo: Person; registered_office: string; other_offices: string
  accountants: Adviser[]; engagement: 'none' | 'compiled' | 'reviewed' | 'audited'; accountants_report: string
  legal_counsel: Adviser; tax_adviser: Adviser; registered_agent: Adviser; bankers: string[]
  signatory: Person; approved_on: string
  share_classes: { name: string; authorized: number | null; par: number | null }[]
  notes: { going_concern: string; property: string; leases: string; retirement: string; related_parties: string; subsequent_events: string; other: string }
}
const A = (): Adviser => ({ name: '', address: '' })
export const blankProfile = (): ReportProfile => ({ legal_name: '', incorporated_on: '', jurisdiction: '', legal_form: '', principal_activities: '', framework: 'ifrs', fye_month: 12,
  directors: [], secretary: '', cfo: { name: '', role: 'Chief Financial Officer' }, registered_office: '', other_offices: '', accountants: [], engagement: 'none', accountants_report: '',
  legal_counsel: A(), tax_adviser: A(), registered_agent: A(), bankers: [], signatory: { name: '', role: 'Director' }, approved_on: '', share_classes: [],
  notes: { going_concern: '', property: '', leases: '', retirement: '', related_parties: '', subsequent_events: '', other: '' } })

// The saved details, merged over sensible defaults from the company's settings and cap table (suggestions only).
export async function reportProfile(): Promise<{ profile: ReportProfile; saved: boolean; missing: { key: string; label: string }[] }> {
  const org = (await currentOrg())!
  const s = org.settings as Record<string, unknown>
  const saved = s.report_profile && typeof s.report_profile === 'object' ? s.report_profile as Partial<ReportProfile> : null
  const p = blankProfile()
  const country = String(s.country ?? ''), us = /united states|usa|^us$/i.test(country) || ['us_llc', 'us_corp'].includes(String(s.entity_type ?? ''))
  p.legal_name = org.name; p.framework = us ? 'us_gaap' : 'ifrs'
  p.jurisdiction = [us && s.state ? String(s.state) : '', country].filter(Boolean).join(', ')
  p.legal_form = ({ us_corp: 'Corporation', us_llc: 'Limited liability company', ng_ltd: 'Private limited company', uk_ltd: 'Private limited company' } as Record<string, string>)[String(s.entity_type ?? '')] ?? ''
  if (!saved) {
    // Founders on the cap table as a starting list of directors.
    try {
      const f = await db().query<{ name: string }>("SELECT DISTINCT h.name FROM equity.holders h JOIN equity.captables c ON c.id = h.captable_id AND c.is_main WHERE h.kind = 'founder' ORDER BY h.name LIMIT 8")
      p.directors = f.rows.map((r) => ({ name: r.name, role: 'Director' }))
    } catch { /* no cap table */ }
    const about = (await db().query<{ about: string | null; headline: string | null }>('SELECT about, headline FROM financials.public_pages LIMIT 1').catch(() => ({ rows: [] }))).rows[0]
    const txt = (about?.about || about?.headline || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    if (txt) p.principal_activities = txt.slice(0, 600)
  }
  const profile: ReportProfile = saved ? { ...p, ...saved, cfo: { ...p.cfo, ...(saved.cfo ?? {}) }, signatory: { ...p.signatory, ...(saved.signatory ?? {}) }, legal_counsel: { ...A(), ...(saved.legal_counsel ?? {}) },
    tax_adviser: { ...A(), ...(saved.tax_adviser ?? {}) }, registered_agent: { ...A(), ...(saved.registered_agent ?? {}) }, notes: { ...p.notes, ...(saved.notes ?? {}) } } : p
  return { profile, saved: !!saved, missing: missingOf(profile) }
}
export function missingOf(p: ReportProfile): { key: string; label: string }[] {
  const m: { key: string; label: string }[] = []
  const need = (ok: boolean, key: string, label: string) => { if (!ok) m.push({ key, label }) }
  need(!!p.legal_name.trim(), 'legal_name', 'Legal name')
  need(!!p.incorporated_on, 'incorporated_on', 'Date of incorporation')
  need(!!p.jurisdiction.trim(), 'jurisdiction', 'Where the company is incorporated')
  need(!!p.principal_activities.trim(), 'principal_activities', 'Principal activities')
  need(p.directors.some((d) => d.name.trim()), 'directors', 'Directors who served')
  need(!!p.cfo.name.trim(), 'cfo', 'Chief Financial Officer (or who reviewed the figures)')
  need(!!p.registered_office.trim(), 'registered_office', 'Registered office address')
  need(p.bankers.some((b) => b.trim()), 'bankers', 'Principal bankers')
  need(!!p.signatory.name.trim(), 'signatory', 'Who signs for the board')
  if (p.engagement === 'reviewed' || p.engagement === 'audited') {
    need(p.accountants.some((a) => a.name.trim()), 'accountants', p.engagement === 'audited' ? 'Auditors' : 'Independent accountants')
    need(!!p.accountants_report.trim(), 'accountants_report', p.engagement === 'audited' ? "The auditors' report (their wording)" : "The accountants' review report (their wording)")
  }
  return m
}

// ---- Figures -------------------------------------------------------------------------------------------------
const BAL = ['cash', 'receivables', 'investments', 'other_assets', 'total_assets', 'payables', 'debt', 'other_liabilities', 'total_liabilities', 'equity']
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
export interface Fig { end: string; months: number; full: boolean; d: Record<string, number | null>; currency: string }
// The figures for the fiscal year ending in month `fye` of year `y`: a yearly statement when one was entered, else the
// months added up (balances from the latest month that has them). A year still running is "N months ended".
export function yearFigures(raw: FinRow[], y: number, fye: number): Fig | null {
  const end = lastDay(y, fye), start = lastDay(y - 1, fye)
  const native = raw.find((r) => r.period_type === 'year' && r.period_end === end)
  if (native) return { end, months: 12, full: true, d: deriveLines(native.lines, 12), currency: native.currency }
  const ms = raw.filter((r) => r.period_type === 'month' && r.period_end > start && r.period_end <= end).sort((a, b) => (a.period_end < b.period_end ? -1 : 1))
  if (!ms.length) return null
  const last = ms[ms.length - 1]!.period_end
  const c = combine(ms, last, 'year')
  const lines: Lines = { ...c.lines }
  for (const k of BAL) { lines[k] = null; for (let i = ms.length - 1; i >= 0; i--) { const v = num(ms[i]!.lines[k]); if (v !== null) { lines[k] = v; break } } }
  const months = (Number(last.slice(0, 4)) - Number(start.slice(0, 4))) * 12 + Number(last.slice(5, 7)) - Number(start.slice(5, 7))
  return { end: last, months, full: months >= 12, d: deriveLines(lines, ms.length), currency: c.currency }
}
// Fiscal years that have figures, newest first (labelled by the year they end in).
export function reportYears(raw: FinRow[], fye: number): { year: number; label: string; months: number }[] {
  const ys = new Set<number>()
  for (const r of raw) { if (r.period_type !== 'month' && r.period_type !== 'year') continue; const y = Number(r.period_end.slice(0, 4)), m = Number(r.period_end.slice(5, 7)); ys.add(m > fye ? y + 1 : y) }
  return [...ys].sort((a, b) => b - a).map((y) => { const f = yearFigures(raw, y, fye); return f ? { year: y, months: f.months, label: periodLabel(f) } : null }).filter((x): x is { year: number; label: string; months: number } => !!x)
}
const longDate = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
const WORD = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']
export const periodLabel = (f: Fig) => (f.full ? 'year ended ' : (WORD[f.months] ?? f.months) + ' months ended ') + longDate(f.end)

export interface RLine { label: string; note?: string; v: (number | null)[]; kind?: 'head' | 'sub' | 'total' | 'grand' | 'memo' | 'line' }
export interface RTable { key: string; title: string; subtitle: string; lines: RLine[]; comment?: string; foot?: string }
export interface Report {
  p: ReportProfile; company: string; currency: string; cols: string[]; period: string; asAt: string; endDate: string; unaudited: boolean; withSecurities: boolean
  results: { label: string; v: number | null }[]; tables: RTable[]; policies: { title: string; text: string }[]; notes: { title: string; text: string; rows?: [string, string][] }[]
  comments: string; subsidiaries: { name: string; country: string | null }[]; generated: string; cap: CapNote | null
}
export interface ShareRow { name: string; kind: string; authorized: number | null; par: number | null; issued: number; available: number | null; contributed: number; pct: number; options: number; fd: number; fdpct: number }
export interface CapNote { as_of: string; classes: { name: string; kind: string; shares: number }[]; conv: { kind: string; count: number; amount: number; currency: string }[]; table: ShareRow[]; start_issued: number | null; start_date: string | null; currency: string }
// The full shareholding at the period end from the cap table: per class, authorised (from the report details),
// issued and outstanding, available for issue, capital contributed, options and the unallocated pool, and fully
// diluted ownership; SAFEs and convertible notes outstanding are shown separately (not in fully diluted shares).
export async function shareholding(end: string, start: string | null, classesInfo: ReportProfile['share_classes']): Promise<CapNote | null> {
  const ct = (await db().query<{ id: string }>('SELECT id FROM equity.captables ORDER BY is_main DESC, created_at LIMIT 1')).rows[0]
  if (!ct) return null
  const cls = (await db().query<{ id: string; name: string; kind: string; issue_price: number | null }>('SELECT id, name, kind, issue_price::float FROM equity.classes WHERE captable_id = $1 ORDER BY seniority, created_at', [ct.id])).rows
  const iss = (await db().query<{ class_id: string; shares: number; paid: number; issued_on: string }>("SELECT class_id, shares::float, (shares * coalesce(price, 0))::float AS paid, to_char(issued_on, 'YYYY-MM-DD') AS issued_on FROM equity.issuances WHERE captable_id = $1 AND issued_on <= $2", [ct.id, end])).rows
  if (!iss.length) return null
  const grants = (await db().query<{ shares: number; exercised: number; cancelled_on: string | null }>("SELECT shares::float, coalesce(exercised, 0)::float AS exercised, to_char(cancelled_on, 'YYYY-MM-DD') AS cancelled_on FROM equity.grants WHERE captable_id = $1 AND granted_on <= $2", [ct.id, end])).rows
  const reserved = (await db().query<{ r: number }>('SELECT coalesce(sum(reserved), 0)::float AS r FROM equity.plans WHERE captable_id = $1', [ct.id])).rows[0]!.r
  const granted = grants.reduce((a, g) => a + g.shares, 0)
  const outstanding = grants.filter((g) => !g.cancelled_on || g.cancelled_on > end).reduce((a, g) => a + Math.max(0, g.shares - g.exercised), 0)
  const pool = outstanding + Math.max(0, reserved - granted)
  const info = (n: string) => (classesInfo ?? []).find((x) => x.name.trim().toLowerCase() === n.trim().toLowerCase())
  const rows = cls.map((c) => {
    const mine = iss.filter((i) => i.class_id === c.id)
    const issued = mine.reduce((a, i) => a + i.shares, 0), contributed = mine.reduce((a, i) => a + i.paid, 0)
    const inf = info(c.name), authorized = inf?.authorized ?? null
    return { name: c.name, kind: c.kind, authorized, par: inf?.par ?? null, issued, contributed, options: 0, available: null as number | null, pct: 0, fd: issued, fdpct: 0 }
  }).filter((r) => r.issued > 0 || r.authorized)
  // Options and the pool convert into common stock: shown on the first common class.
  const common = rows.find((r) => r.kind === 'common') ?? rows[0]
  if (common) { common.options = pool; common.fd = common.issued + pool }
  const ti = rows.reduce((a, r) => a + r.issued, 0), tfd = rows.reduce((a, r) => a + r.fd, 0)
  for (const r of rows) { r.pct = ti ? (r.issued / ti) * 100 : 0; r.fdpct = tfd ? (r.fd / tfd) * 100 : 0; r.available = r.authorized === null ? null : Math.max(0, r.authorized - r.issued - r.options) }
  const conv = (await db().query<{ kind: string; count: number; amount: number; currency: string }>("SELECT kind, count(*)::int AS count, sum(amount)::float AS amount, currency FROM equity.convertibles WHERE captable_id = $1 AND issued_on <= $2 AND status = 'outstanding' GROUP BY kind, currency ORDER BY kind", [ct.id, end])).rows
  const startIssued = start ? iss.filter((i) => i.issued_on <= start).reduce((a, i) => a + i.shares, 0) : null
  return { as_of: end, classes: rows.map((r) => ({ name: r.name, kind: r.kind, shares: r.issued })), conv, table: rows, start_issued: startIssued, start_date: start, currency: conv[0]?.currency ?? 'USD' }
}

export function buildReport(raw: FinRow[], o: { p: ReportProfile; year: number; withSecurities: boolean; comments: string; notes: Record<string, string>; subsidiaries: { name: string; country: string | null }[]; cap: CapNote | null }): Report {
  const p = o.p, fye = p.fye_month || 12
  const cur = yearFigures(raw, o.year, fye)
  if (!cur) throw apiError('empty', 'There are no figures for that year.')
  const prev = yearFigures(raw, o.year - 1, fye), prev2 = yearFigures(raw, o.year - 2, fye)
  const figs = [cur, ...(prev ? [prev] : [])]
  const opening = [prev, prev2] // balances at the start of each column's period
  const V = (k: string) => figs.map((f) => f.d[k] ?? null)
  const has = (k: string) => V(k).some((x) => x !== null)
  const cols = figs.map((f) => (f.full ? f.end.slice(0, 4) : new Date(f.end + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })))
  const neg = (a: (number | null)[]) => a.map((x) => (x === null ? null : -Math.abs(x)))
  const add = (...a: (number | null)[][]) => figs.map((_, i) => (a.some((x) => x[i] !== null) ? a.reduce((s, x) => s + (x[i] ?? 0), 0) : null))
  const sub = (a: (number | null)[], b: (number | null)[]) => figs.map((_, i) => (a[i] === null ? null : a[i]! - (b[i] ?? 0)))
  const L = (label: string, v: (number | null)[], kind: RLine['kind'] = 'line', note?: string): RLine[] => (v.some((x) => x !== null) ? [{ label, v, kind, note }] : [])
  const sec = o.withSecurities, unaud = p.engagement !== 'audited'

  // Statement of operations (by function; payroll that was not allocated to a function shown on its own line).
  const gp = V('gross_profit'), opex = V('opex_total'), da = V('depreciation'), intr = V('interest'), tax = V('tax'), ni = V('net_income')
  const opInc = figs.map((_, i) => (gp[i] === null && opex[i] === null ? null : (gp[i] ?? 0) - (opex[i] ?? 0) - (da[i] ?? 0)))
  const pbtCalc = figs.map((_, i) => (opInc[i] === null ? null : opInc[i]! - (intr[i] ?? 0)))
  // Anything between operating income and the net income reported is other income (expense).
  const other = figs.map((_, i) => (ni[i] !== null && pbtCalc[i] !== null ? Math.round(ni[i]! + (tax[i] ?? 0) - pbtCalc[i]!) : null)).map((x) => (x !== null && Math.abs(x) >= 1 ? x : null))
  const pbt = figs.map((_, i) => (pbtCalc[i] === null ? (ni[i] !== null ? ni[i]! + (tax[i] ?? 0) : null) : pbtCalc[i]! + (other[i] ?? 0)))
  const netInc = figs.map((_, i) => ni[i] ?? (pbt[i] === null ? null : pbt[i]! - (tax[i] ?? 0)))
  const ops: RLine[] = [
    ...L('Revenue', V('revenue')), ...L('Cost of revenue', neg(V('cogs'))), ...L('Gross profit', gp, 'total'),
    ...(has('opex_total') || ['opex_marketing', 'opex_rnd', 'opex_ga', 'opex_payroll', 'opex_other'].some(has) ? [{ label: 'Operating expenses', v: figs.map(() => null), kind: 'head' as const }] : []),
    ...L('Sales and marketing', neg(V('opex_marketing')), 'sub'), ...L('Research and development', neg(V('opex_rnd')), 'sub'), ...L('General and administrative', neg(V('opex_ga')), 'sub'),
    ...L('Salaries and wages (not allocated above)', neg(V('opex_payroll')), 'sub'), ...L('Other operating expenses', neg(V('opex_other')), 'sub'),
    ...L('Total operating expenses', neg(opex), 'total'), ...L('Depreciation and amortisation', neg(da)),
    ...L('Operating income (loss)', opInc, 'total'), ...L('Interest expense, net', neg(intr)), ...L('Other income (expense), net', other),
    ...L('Income (loss) before income taxes', pbt, 'total'), ...L('Income tax expense', neg(tax)), ...L('Net income (loss) for the period', netInc, 'grand'),
    ...L('EBITDA (non-GAAP, for reference)', V('ebitda'), 'memo')]

  // Balance sheet (classified). Assets the figures total but do not itemise are shown as such, never invented.
  const cash = V('cash'), secv = V('investments'), rec = V('receivables'), oth = V('other_assets')
  const curA = add(cash, sec ? secv : figs.map(() => null), rec)
  const nonCurItem = add(sec ? figs.map(() => null) : secv, oth)
  const ta = V('total_assets'), tl = V('total_liabilities'), eq = V('equity')
  const itemised = add(curA, nonCurItem)
  const unitem = figs.map((_, i) => (ta[i] !== null && itemised[i] !== null && Math.abs(ta[i]! - itemised[i]!) >= 1 ? ta[i]! - itemised[i]! : null))
  const nonCur = add(nonCurItem, unitem)
  const totA = figs.map((_, i) => ta[i] ?? itemised[i])
  const liabItems = add(V('payables'), V('debt'), V('other_liabilities'))
  const totL = figs.map((_, i) => tl[i] ?? liabItems[i])
  const unL = figs.map((_, i) => (tl[i] !== null && liabItems[i] !== null && Math.abs(tl[i]! - liabItems[i]!) >= 1 ? tl[i]! - liabItems[i]! : null))
  const bal: RLine[] = [
    { label: 'ASSETS', v: figs.map(() => null), kind: 'head' }, { label: 'Current assets', v: figs.map(() => null), kind: 'head' },
    ...L('Cash and cash equivalents', cash, 'sub', 'Note 1'), ...(sec ? L('Marketable securities (treasury bills and similar)', secv, 'sub', 'Note 1') : []), ...L('Accounts receivable', rec, 'sub'),
    ...L('Total current assets', curA, 'total'),
    ...(nonCur.some((x) => x !== null) ? [{ label: 'Non-current assets', v: figs.map(() => null), kind: 'head' as const }] : []),
    ...(sec ? [] : L('Investments', secv, 'sub')), ...L('Other assets', oth, 'sub'), ...L('Other assets (not itemised in the figures)', unitem, 'sub'),
    ...L('Total non-current assets', nonCur, 'total'), ...L('TOTAL ASSETS', totA, 'grand'),
    { label: 'LIABILITIES AND SHAREHOLDERS\' EQUITY', v: figs.map(() => null), kind: 'head' }, { label: 'Liabilities', v: figs.map(() => null), kind: 'head' },
    ...L('Accounts payable and accrued liabilities', V('payables'), 'sub'), ...L('Borrowings', V('debt'), 'sub'), ...L('Other liabilities', V('other_liabilities'), 'sub'),
    ...L('Other liabilities (not itemised in the figures)', unL, 'sub'), ...L('Total liabilities', totL, 'total'),
    ...L('Total shareholders\' equity', eq, 'total', o.cap && o.cap.classes.length ? 'Note 2' : undefined),
    ...L('TOTAL LIABILITIES AND SHAREHOLDERS\' EQUITY', figs.map((_, i) => (totL[i] === null && eq[i] === null ? null : (totL[i] ?? 0) + (eq[i] ?? 0))), 'grand')]
  const balFoot = figs.some((_, i) => totA[i] !== null && eq[i] !== null && totL[i] !== null && Math.abs(totA[i]! - totL[i]! - eq[i]!) > Math.max(1, Math.abs(totA[i]!) * 0.0005))
    ? 'Total assets differ from liabilities plus equity in the figures provided; please check the balance sheet before issuing.' : undefined

  // Changes in shareholders' equity: opening, the result, and everything else (capital raised, buy-backs, translation).
  const openEq = opening.slice(0, figs.length).map((f) => (f ? f.d.equity ?? null : null))
  const movement = figs.map((_, i) => (eq[i] !== null && openEq[i] !== null ? eq[i]! - openEq[i]! - (netInc[i] ?? 0) : null))
  const eqLines: RLine[] = [...L('Balance at the beginning of the period', openEq), ...L('Net income (loss) for the period', netInc),
    ...L('Capital contributions and other movements', movement), ...L('Balance at the end of the period', eq, 'grand')]

  // Cash flows (indirect method).
  const ocf = V('operating_cf'), icf = V('investing_cf'), fcf = V('financing_cf')
  const adj = figs.map((_, i) => (ocf[i] !== null && netInc[i] !== null ? ocf[i]! - netInc[i]! : null))
  const net = add(ocf, icf, fcf)
  const openCash = opening.slice(0, figs.length).map((f) => (f ? f.d.cash ?? null : null))
  const diff = figs.map((_, i) => (net[i] !== null && openCash[i] !== null && cash[i] !== null ? cash[i]! - openCash[i]! - net[i]! : null)).map((x) => (x !== null && Math.abs(x) >= 1 ? x : null))
  const cfl: RLine[] = [{ label: 'Operating activities', v: figs.map(() => null), kind: 'head' }, ...(has('operating_cf') ? L('Net income (loss)', netInc, 'sub') : []),
    ...L('Adjustments for non-cash items and changes in working capital', adj, 'sub'), ...L('Net cash from (used in) operating activities', ocf, 'total'),
    { label: 'Investing activities', v: figs.map(() => null), kind: 'head' }, ...L('Net cash from (used in) investing activities', icf, 'total'),
    { label: 'Financing activities', v: figs.map(() => null), kind: 'head' }, ...L('Net cash from (used in) financing activities', fcf, 'total'),
    ...L('Net increase (decrease) in cash', net, 'total'), ...L('Cash at the beginning of the period', openCash), ...L('Effect of exchange rates and other differences', diff), ...L('Cash at the end of the period', cash, 'grand')]
  const secNote = sec && secv[0] !== null ? 'In addition to cash, the company held ' + money(secv[0]!, cur.currency) + ' in marketable securities (treasury bills and similar) at ' + longDate(cur.end) + '.' : undefined
  // Headings with nothing under them are dropped (a heading may sit directly over one sub-heading).
  const strip = (ls: RLine[]) => ls.filter((r, i) => r.kind !== 'head' || (ls[i + 1] && (ls[i + 1]!.kind !== 'head' || (ls[i + 2] && ls[i + 2]!.kind !== 'head'))))
  const asAt = 'as at ' + longDate(cur.end), period = periodLabel(cur)
  const tables: RTable[] = [
    { key: 'balance', title: 'Balance sheet', subtitle: asAt, lines: strip(bal), comment: o.notes.balance || undefined, foot: balFoot },
    { key: 'operations', title: 'Statement of operations', subtitle: 'for the ' + period, lines: strip(ops), comment: o.notes.income || undefined },
    { key: 'equity', title: 'Statement of changes in shareholders\' equity', subtitle: 'for the ' + period, lines: eqLines, foot: eqLines.length ? undefined : 'Shareholders\' equity is not in the figures for these periods.' },
    { key: 'cashflow', title: 'Statement of cash flows', subtitle: 'for the ' + period, lines: strip(cfl), comment: o.notes.cash || undefined, foot: secNote }]
    .filter((t) => t.lines.some((l) => l.kind !== 'head') || t.foot)

  // Accounting policies, written for the framework chosen and the company's own facts.
  const gaap = p.framework === 'us_gaap', fw = gaap ? 'accounting principles generally accepted in the United States of America (US GAAP)' : p.framework === 'ifrs_sme' ? 'the IFRS for SMEs Accounting Standard' : 'International Financial Reporting Standards (IFRS)'
  const subs = o.subsidiaries
  const policies: { title: string; text: string }[] = [
    { title: 'Nature of business', text: (p.legal_name || o.p.legal_name) + (p.incorporated_on ? ' was incorporated on ' + longDate(p.incorporated_on) : ' is incorporated') + (p.jurisdiction ? ' in ' + p.jurisdiction : '') + (p.legal_form ? ' as ' + aOr(p.legal_form) : '') + '.' + (p.principal_activities ? ' ' + sentence(p.principal_activities) : '') },
    { title: 'Basis of preparation', text: 'These financial statements have been prepared on the accrual basis in accordance with ' + fw + ', under the historical cost convention except where stated. They are presented in ' + cur.currency + '.' + (unaud ? ' They have not been audited.' : '') },
    ...(subs.length ? [{ title: 'Basis of consolidation', text: 'The consolidated financial statements include the accounts of the company and its subsidiaries: ' + subs.map((x) => x.name + (x.country ? ' (' + x.country + ')' : '')).join(', ') + '. Intercompany balances and transactions are eliminated on consolidation.' }] : []),
    { title: 'Foreign currency', text: 'Transactions in other currencies are recorded at the exchange rate on the date of the transaction. Monetary assets and liabilities in other currencies are translated at the rate at the balance sheet date' + (subs.length ? ', and the results of subsidiaries with other functional currencies at average rates for the period' : '') + '. Exchange differences are recognised in ' + (subs.length ? 'other comprehensive income or ' : '') + 'the statement of operations.' },
    { title: 'Use of estimates', text: 'Preparing financial statements requires management to make estimates and assumptions that affect the amounts reported. Actual results could differ from those estimates.' },
    { title: 'Cash and cash equivalents', text: 'Cash and cash equivalents comprise cash at bank and on hand and short-term, highly liquid deposits with original maturities of three months or less.' + (sec ? ' Treasury bills and similar government securities held for liquidity are shown separately as marketable securities and, in the directors\' view, are available to fund operations.' : '') },
    { title: 'Accounts receivable', text: 'Receivables are stated at the amount invoiced less an allowance for amounts not expected to be collected, based on a review of each customer\'s balance.' },
    { title: 'Property and equipment', text: 'Property and equipment are stated at cost less accumulated depreciation, which is charged on a straight-line basis over each asset\'s estimated useful life.' },
    { title: 'Revenue recognition', text: 'Revenue is recognised when control of goods or services passes to the customer, at the amount the company expects to be entitled to, in accordance with ' + (gaap ? 'ASC 606, Revenue from Contracts with Customers' : 'IFRS 15, Revenue from Contracts with Customers') + '.' },
    { title: 'Income taxes', text: gaap ? 'Income taxes are accounted for under the asset and liability method (ASC 740). Deferred tax assets are reduced by a valuation allowance when it is more likely than not that they will not be realised.' : 'Current tax is the expected tax payable on taxable income for the period. Deferred tax is recognised on temporary differences, and deferred tax assets only to the extent that taxable profits are probable (IAS 12).' },
    { title: 'Share-based payments', text: 'Share-based awards to employees are measured at fair value on the grant date and expensed over the vesting period (' + (gaap ? 'ASC 718' : 'IFRS 2') + ').' }]
  const notes: Report['notes'] = []
  if (o.cap && o.cap.classes.length) notes.push({ title: 'Share capital', text: (o.cap.table.some((r) => r.authorized) ? 'The company is authorised to issue ' + o.cap.table.filter((r) => r.authorized).map((r) => Math.round(r.authorized!).toLocaleString('en-US') + ' shares of ' + r.name.toLowerCase() + (r.par ? ' stock, ' + r.par + ' par value per share' : ' stock')).join(', and ') + '. ' : '') + 'Shares issued and outstanding at ' + longDate(o.cap.as_of) + ' (the full shareholding is shown with the statement of changes in shareholders\' equity):', rows: o.cap.classes.map((c) => [c.name + (c.kind === 'preferred' ? ' (preferred)' : ''), Math.round(c.shares).toLocaleString('en-US') + ' shares']) })
  if (o.cap && o.cap.conv.length) notes.push({ title: 'Convertible instruments', text: 'Instruments that convert into shares on a future equity financing or liquidity event, outstanding at ' + longDate(o.cap.as_of) + ':', rows: o.cap.conv.map((c) => [c.count + ' ' + (c.kind === 'safe' ? 'SAFE' : c.kind === 'note' ? 'convertible note' : c.kind) + (c.count === 1 ? '' : 's'), money(c.amount, c.currency)]) })
  const add2 = (title: string, t: string) => { if (t.trim()) notes.push({ title, text: t.trim() }) }
  add2('Going concern and management\'s plans', p.notes.going_concern); add2('Property and equipment', p.notes.property); add2('Leases', p.notes.leases)
  add2('Retirement plan', p.notes.retirement); add2('Related party transactions', p.notes.related_parties); add2('Events after the balance sheet date', p.notes.subsequent_events); add2('Other information', p.notes.other)
  const results = [{ label: 'Revenue', v: V('revenue')[0] ?? null }, { label: 'Income (loss) before income taxes', v: pbt[0] ?? null }, { label: 'Income tax expense', v: tax[0] === null ? null : -Math.abs(tax[0]!) }, { label: 'Net income (loss) for the period', v: netInc[0] ?? null }, { label: 'Total assets at the end of the period', v: totA[0] ?? null }].filter((x) => x.v !== null)
  return { p, company: p.legal_name || 'The company', currency: cur.currency, cols, period, asAt, endDate: longDate(cur.end), unaudited: unaud, withSecurities: sec, results, tables, policies, notes, comments: o.comments, subsidiaries: subs, generated: new Date().toISOString().slice(0, 10), cap: o.cap }
}
const aOr = (t: string) => (/^(a|an|the)\s/i.test(t) ? t : (/^[aeiou]/i.test(t) ? 'an ' : 'a ') + t)
function sentence(t: string) { const s = t.trim().replace(/\s+/g, ' '); return s.endsWith('.') ? s : s + '.' }
export const money = (v: number, c: string) => (v < 0 ? '(' : '') + (c === 'USD' ? '$' : c + ' ') + Math.round(Math.abs(v)).toLocaleString('en-US') + (v < 0 ? ')' : '')
const fmtN = (x: number | null) => (x === null ? '-' : Math.round(x) === 0 ? '-' : x < 0 ? '(' + Math.round(Math.abs(x)).toLocaleString('en-US') + ')' : Math.round(x).toLocaleString('en-US'))
const clean = (s: string) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/•/g, '-').replace(/₦/g, 'NGN ').replace(/[^\x20-\x7E -ÿ]/g, '')

// What the report says about who prepared and reviewed it.
const ENG: Record<ReportProfile['engagement'], string> = { none: 'Prepared by management', compiled: 'Compiled by', reviewed: 'Reviewed by', audited: 'Audited by' }
function directorsReport(r: Report): string[] {
  const p = r.p, out: string[] = []
  out.push('The directors present their report together with the financial statements of ' + r.company + ' for the ' + r.period + (r.p.engagement === 'reviewed' || r.p.engagement === 'audited' ? ', and the report of the ' + (r.p.engagement === 'audited' ? 'auditors' : 'independent accountants') : '') + '.')
  return [...out, p.principal_activities ? 'PRINCIPAL ACTIVITIES\n' + sentence(p.principal_activities) : '',
    'LEGAL FORM\n' + r.company + (p.incorporated_on ? ' was incorporated on ' + longDate(p.incorporated_on) : ' is incorporated') + (p.jurisdiction ? ' in ' + p.jurisdiction : '') + (p.legal_form ? ' as ' + aOr(p.legal_form) : '') + '.' + (r.subsidiaries.length ? ' It has ' + (r.subsidiaries.length === 1 ? 'one subsidiary' : r.subsidiaries.length + ' subsidiaries') + ': ' + r.subsidiaries.map((s) => s.name + (s.country ? ' (' + s.country + ')' : '')).join(', ') + '.' : '')].filter(Boolean)
}
function accountantsLine(r: Report): string {
  const a = r.p.accountants.filter((x) => x.name.trim())
  if (r.p.engagement === 'none' || !a.length) return 'The financial statements were prepared by management and have not been audited or reviewed by independent accountants.'
  const verb = r.p.engagement === 'audited' ? 'audited' : r.p.engagement === 'reviewed' ? 'reviewed' : 'compiled'
  return 'The financial statements were ' + verb + ' by ' + a.map((x) => x.name).join(' and ') + '.' + (r.p.registered_agent.name ? ' ' + r.p.registered_agent.name + ' served as registered agent.' : '')
}

// ---- PDF -----------------------------------------------------------------------------------------------------
export async function reportPdf(r: Report, logo: { data: Buffer; ext: 'png' | 'jpeg' } | null): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.setTitle(r.company + ' financial statements, ' + r.period); pdf.setProducer('Finvry'); pdf.setCreator(clean(r.company))
  // Finvry's typeface, Instrument Sans.
  pdf.registerFontkit(fontkit)
  const reg = await pdf.embedFont(Buffer.from(INSTRUMENT_TTF.regular, 'base64'), { subset: true }), bold = await pdf.embedFont(Buffer.from(INSTRUMENT_TTF.semibold, 'base64'), { subset: true }), ital = await pdf.embedFont(Buffer.from(INSTRUMENT_TTF.italic, 'base64'), { subset: true })
  let img: PDFImage | null = null
  if (logo) img = await (logo.ext === 'png' ? pdf.embedPng(logo.data) : pdf.embedJpg(logo.data)).catch(() => null)
  let W = 612, H = 792
  const M = 64, navy = rgb(12 / 255, 26 / 255, 46 / 255), ink = rgb(0.1, 0.1, 0.12), mut = rgb(0.42, 0.44, 0.47), rule = rgb(0.7, 0.72, 0.75)
  const CO = clean(r.company).toUpperCase()
  let page!: PDFPage, y = 0, n = 0, cont = ''
  const pages: PDFPage[] = []
  const newPage = (title?: string, land = false) => {
    W = land ? 792 : 612; H = land ? 612 : 792
    page = pdf.addPage([W, H]); pages.push(page); n++; y = H - M
    page.drawText(CO, { x: M, y, size: 10, font: bold, color: navy })
    if (img) { const h = 22, w = Math.min(110, (img.width / img.height) * h); page.drawImage(img, { x: W - M - w, y: y - 6, width: w, height: h }) }
    y -= 30
    if (title) { cont = title; page.drawText(clean(title).toUpperCase(), { x: M, y, size: 13, font: bold, color: navy }); y -= 8; page.drawLine({ start: { x: M, y }, end: { x: M + 150, y }, thickness: 1, color: navy }); y -= 22 }
  }
  const ensure = (h: number) => { if (y - h < M + 20) newPage(cont + ' (continued)') }
  const wrap = (t: string, f: PDFFont, size: number, w: number) => { const out: string[] = []; for (const para of clean(t).split('\n')) { let line = ''; for (const word of para.split(/\s+/).filter(Boolean)) { const tryL = line ? line + ' ' + word : word; if (f.widthOfTextAtSize(tryL, size) > w && line) { out.push(line); line = word } else line = tryL } out.push(line) } return out }
  const para = (t: string, o: { f?: PDFFont; size?: number; x?: number; w?: number; gap?: number; color?: ReturnType<typeof rgb> } = {}) => {
    const f = o.f ?? reg, size = o.size ?? 10.5, x = o.x ?? M, w = o.w ?? W - M - x
    for (const l of wrap(t, f, size, w)) { ensure(size + 4); page.drawText(l, { x, y, size, font: f, color: o.color ?? ink }); y -= size + 4 }
    y -= o.gap ?? 6
  }
  const head = (t: string) => { ensure(30); y -= 4; page.drawText(clean(t).toUpperCase(), { x: M, y, size: 10, font: bold, color: navy }); y -= 16 }
  const starts: { title: string; page: number }[] = []
  const section = (title: string, land = false) => { newPage(title, land); starts.push({ title, page: n }) }

  // Cover
  newPage()
  y = H - 210
  if (img) { const h = 60, w = Math.min(220, (img.width / img.height) * h); page.drawImage(img, { x: M, y, width: w, height: h }); y -= 40 }
  page.drawText('FINANCIAL STATEMENTS', { x: M, y, size: 12, font: bold, color: mut }); y -= 26
  for (const l of wrap('for the ' + r.period, reg, 16, W - M * 2)) { page.drawText(l, { x: M, y, size: 16, font: reg, color: ink }); y -= 22 }
  y -= 18
  for (const l of wrap(r.company, bold, 28, W - M * 2)) { page.drawText(l, { x: M, y, size: 28, font: bold, color: navy }); y -= 34 }
  y = 220
  const acc = r.p.accountants.filter((a) => a.name.trim())
  page.drawText(clean(ENG[r.p.engagement] + (r.p.engagement === 'none' ? '' : ':')), { x: M, y, size: 9.5, font: bold, color: mut }); y -= 16
  if (r.p.engagement !== 'none' && acc.length) acc.forEach((a, i) => { let yy = y; const x = M + i * 230; page.drawText(clean(a.name), { x, y: yy, size: 10.5, font: bold, color: ink }); yy -= 14; for (const l of wrap(a.address, reg, 9.5, 210)) { page.drawText(l, { x, y: yy, size: 9.5, font: reg, color: ink }); yy -= 12 } })
  y -= 70
  if (r.p.cfo.name.trim()) { page.drawText('Reviewed by:', { x: M, y, size: 9.5, font: bold, color: mut }); y -= 16; page.drawText(clean(r.p.cfo.name), { x: M, y, size: 10.5, font: bold, color: ink }); y -= 14; page.drawText(clean((r.p.cfo.role || 'Chief Financial Officer') + ', ' + r.company), { x: M, y, size: 9.5, font: reg, color: ink }) }
  if (r.unaudited) page.drawText('Unaudited', { x: W - M - bold.widthOfTextAtSize('UNAUDITED', 9), y: M, size: 9, font: bold, color: mut })

  // Contents (page numbers filled in at the end)
  newPage('Contents'); const contentsPage = page, contentsY = y

  // Directors and professional advisers
  section('Directors and professional advisers')
  const kv = (label: string, lines: string[]) => {
    const ls = lines.flatMap((l) => wrap(l, reg, 10.5, W - M - 200)).filter((l) => l.trim()); if (!ls.length) return
    ensure(14 * ls.length + 8); page.drawText(clean(label), { x: M, y, size: 10.5, font: bold, color: ink })
    for (const l of ls) { page.drawText(l, { x: M + 190, y, size: 10.5, font: reg, color: ink }); y -= 14 } y -= 8
  }
  const p = r.p
  kv('Directors', p.directors.filter((d) => d.name.trim()).map((d) => d.name + (d.role ? '  -  ' + d.role : '')))
  kv('Company secretary', [p.secretary])
  kv('Chief Financial Officer', [p.cfo.name + (p.cfo.role && !/chief financial/i.test(p.cfo.role) ? ' (' + p.cfo.role + ')' : '')].filter((x) => x.trim()))
  kv('Registered office', p.registered_office.split('\n'))
  kv('Other offices', p.other_offices.split('\n'))
  kv(p.engagement === 'audited' ? 'Auditors' : 'Independent accountants', acc.flatMap((a) => [a.name, ...a.address.split('\n'), '']).slice(0, -1))
  kv('Legal counsel', [p.legal_counsel.name, ...p.legal_counsel.address.split('\n')])
  kv('Tax advisers', [p.tax_adviser.name, ...p.tax_adviser.address.split('\n')])
  kv('Registered agent', [p.registered_agent.name, ...p.registered_agent.address.split('\n')])
  kv('Principal bankers', p.bankers.filter((b) => b.trim()))

  // Report of the directors
  section('Report of the directors')
  for (const block of directorsReport(r)) { const [h, ...rest] = block.split('\n'); if (rest.length) { head(h!); para(rest.join('\n')) } else para(h!) }
  if (r.results.length) {
    head('Results for the ' + (r.period.startsWith('year') ? 'year' : 'period'))
    page.drawText(r.currency, { x: W - M - bold.widthOfTextAtSize(r.currency, 9.5), y, size: 9.5, font: bold, color: mut }); y -= 14
    for (const x of r.results) { ensure(16); page.drawText(clean(x.label), { x: M + 10, y, size: 10.5, font: reg, color: ink }); const t = fmtN(x.v); page.drawText(t, { x: W - M - reg.widthOfTextAtSize(t, 10.5), y, size: 10.5, font: reg, color: ink }); y -= 15 }
    y -= 6
  }
  if (r.comments.trim()) { head('Review of the business'); for (const b of r.comments.split(/\n{2,}/)) para(b) }
  const dirs = p.directors.filter((d) => d.name.trim())
  if (dirs.length) { head('Directors'); para('The directors who served during the period were:', { gap: 2 }); for (const d of dirs) { ensure(15); page.drawText(clean(d.name), { x: M + 10, y, size: 10.5, font: reg, color: ink }); if (d.role) page.drawText(clean(d.role), { x: M + 260, y, size: 10.5, font: reg, color: mut }); y -= 15 } y -= 6 }
  head('Accountants'); para(accountantsLine(r))
  ensure(80); y -= 20
  para('By order of the board', { f: ital, gap: 26 })
  if (p.signatory.name) { page.drawLine({ start: { x: M, y: y + 12 }, end: { x: M + 180, y: y + 12 }, thickness: 0.5, color: rule }); para(p.signatory.name + (p.signatory.role ? ', ' + p.signatory.role : ''), { gap: 2 }) }
  para((p.approved_on ? longDate(p.approved_on) : '') + (p.jurisdiction ? (p.approved_on ? ' · ' : '') + p.jurisdiction : ''), { color: mut })

  // Accountants' report: only the accountants' own words; never written for them.
  if ((p.engagement === 'reviewed' || p.engagement === 'audited') && p.accountants_report.trim()) {
    section(p.engagement === 'audited' ? 'Independent auditors\' report' : 'Independent accountants\' review report')
    for (const b of p.accountants_report.split(/\n{2,}/)) para(b)
  }

  // Accounting policies
  section('Significant accounting policies')
  para('Note 1. The principal accounting policies applied in preparing these financial statements are set out below.', { f: ital, size: 9.5 })
  r.policies.forEach((x) => { head(x.title); para(x.text) })

  // The full shareholding (landscape): per class, then SAFEs and convertibles, then fully diluted shares.
  const shareTable = (c: CapNote) => {
    section('Shareholding', true)
    page.drawText(clean('as at ' + longDate(c.as_of) + ', from the cap table'), { x: M, y: y + 6, size: 10, font: ital, color: mut }); y -= 20
    const cw = [62, 66, 62, 80, 50, 64, 66, 52], heads = ['Authorised', 'Issued and outstanding', 'Available for issue', 'Capital contributed (' + c.currency + ')', '% issued', 'Options and pool', 'Fully diluted', '% fully diluted']
    const x0 = W - M - cw.reduce((a, b) => a + b, 0), right = (i: number) => x0 + cw.slice(0, i + 1).reduce((a, b) => a + b, 0)
    heads.forEach((h, i) => { wrap(h, bold, 8.5, cw[i]! - 6).forEach((l, k) => page.drawText(l, { x: right(i) - bold.widthOfTextAtSize(l, 8.5), y: y - k * 10, size: 8.5, font: bold, color: ink })) })
    const hl = Math.max(...heads.map((h, i) => wrap(h, bold, 8.5, cw[i]! - 6).length))
    y -= 14 + hl * 10; page.drawLine({ start: { x: M, y: y + 10 }, end: { x: W - M, y: y + 10 }, thickness: 0.5, color: rule })
    const num0 = (v: number | null) => (v === null ? '' : Math.round(v).toLocaleString('en-US'))
    const pct = (v: number) => v.toFixed(2) + '%'
    const row = (label: string, vals: string[], f: PDFFont = reg, indent = 0) => { ensure(16); page.drawText(clean(label), { x: M + indent, y, size: 9.5, font: f, color: ink }); vals.forEach((v, i) => { if (v) page.drawText(v, { x: right(i) - f.widthOfTextAtSize(v, 9.5), y, size: 9.5, font: f, color: ink }) }); y -= 15 }
    for (const kind of ['common', 'preferred', ...new Set(c.table.map((x) => x.kind).filter((k) => k !== 'common' && k !== 'preferred'))]) {
      const rs = c.table.filter((x) => x.kind === kind); if (!rs.length) continue
      row(kind === 'common' ? 'Common stock' : kind === 'preferred' ? 'Preferred stock' : kind.charAt(0).toUpperCase() + kind.slice(1), [], bold)
      for (const x of rs) row(x.name + (x.par ? ' (par ' + x.par + ')' : ''), [num0(x.authorized), num0(x.issued), num0(x.available), num0(x.contributed), pct(x.pct), x.options ? num0(x.options) : '', num0(x.fd), pct(x.fdpct)], reg, 12)
    }
    const tot = (k: 'authorized' | 'issued' | 'contributed' | 'options' | 'fd') => c.table.reduce((a, x) => a + (x[k] ?? 0), 0)
    page.drawLine({ start: { x: x0 + 6, y: y + 12 }, end: { x: W - M, y: y + 12 }, thickness: 0.5, color: rule })
    row('Total stock', [c.table.some((x) => x.authorized) ? num0(tot('authorized')) : '', num0(tot('issued')), '', num0(tot('contributed')), '100.00%', tot('options') ? num0(tot('options')) : '', num0(tot('fd')), '100.00%'], bold)
    y -= 6
    if (c.conv.length) {
      row('SAFEs and convertible notes outstanding', [], bold)
      for (const v of c.conv) row(v.count + ' ' + (v.kind === 'safe' ? 'SAFE' : 'convertible note') + (v.count === 1 ? '' : 's'), ['', '', '', num0(v.amount), '', '', '', ''], reg, 12)
      if (c.conv.length > 1) row('Total SAFEs and convertibles', ['', '', '', num0(c.conv.reduce((a, v) => a + v.amount, 0)), '', '', '', ''], bold)
      y -= 6
    }
    page.drawLine({ start: { x: M, y: y + 12 }, end: { x: W - M, y: y + 12 }, thickness: 0.5, color: ink })
    row('Fully diluted shares at ' + longDate(c.as_of), ['', '', '', '', '', '', num0(tot('fd')), ''], bold)
    y -= 8
    if (c.start_issued !== null && c.start_date) para('Shares issued and outstanding at ' + longDate(c.start_date) + ': ' + num0(c.start_issued) + '.', { size: 9.5 })
    para('Options and pool are options granted and outstanding plus shares reserved for the option plan and not yet granted; they convert into common stock. SAFEs and convertible notes convert on a future equity financing or liquidity event at terms not yet known, so they are not included in fully diluted shares.' + (c.table.some((x) => x.authorized) ? '' : ' Add the authorised shares for each class in the report details to complete the Authorised and Available columns.'), { f: ital, size: 8.5, color: mut })
  }
  // Statements
  const colX = (i: number) => W - M - (r.cols.length - 1 - i) * 92
  for (const t of r.tables) {
    section(t.title)
    page.drawText(clean(t.subtitle), { x: M, y: y + 6, size: 10, font: ital, color: mut }); y -= 18
    const hdr = () => { r.cols.forEach((c, i) => { const s = clean(c); page.drawText(s, { x: colX(i) - bold.widthOfTextAtSize(s, 10), y, size: 10, font: bold, color: ink }); page.drawText(r.currency, { x: colX(i) - reg.widthOfTextAtSize(r.currency, 8.5), y: y - 12, size: 8.5, font: reg, color: mut }) }); page.drawText('Note', { x: W - M - r.cols.length * 92 - 30, y, size: 9, font: bold, color: mut }); y -= 28 }
    hdr()
    for (const l of t.lines) {
      if (y < M + 40) { newPage(t.title + ' (continued)'); hdr() }
      const f = l.kind === 'head' || l.kind === 'total' || l.kind === 'grand' ? bold : l.kind === 'memo' ? ital : reg, size = 10.2
      const x = M + (l.kind === 'sub' ? 14 : 0)
      if (l.kind === 'head') y -= 4
      for (const [k, s] of wrap(l.label, f, size, W - M - r.cols.length * 92 - 50 - x).entries()) { page.drawText(s, { x, y: y - k * 12, size, font: f, color: l.kind === 'memo' ? mut : ink }) }
      const extra = (wrap(l.label, f, size, W - M - r.cols.length * 92 - 50 - x).length - 1) * 12
      if (l.note) page.drawText(l.note.replace('Note ', ''), { x: W - M - r.cols.length * 92 - 22, y: y - extra, size: 9, font: reg, color: mut })
      if (l.kind !== 'head') r.cols.forEach((_, i) => { const s = fmtN(l.v[i] ?? null); page.drawText(s, { x: colX(i) - f.widthOfTextAtSize(s, size), y: y - extra, size, font: f, color: l.kind === 'memo' ? mut : ink }) })
      if (l.kind === 'total' || l.kind === 'grand') r.cols.forEach((_, i) => page.drawLine({ start: { x: colX(i) - 70, y: y - extra + 12 }, end: { x: colX(i), y: y - extra + 12 }, thickness: 0.5, color: rule }))
      if (l.kind === 'grand') r.cols.forEach((_, i) => { page.drawLine({ start: { x: colX(i) - 70, y: y - extra - 4 }, end: { x: colX(i), y: y - extra - 4 }, thickness: 0.5, color: ink }); page.drawLine({ start: { x: colX(i) - 70, y: y - extra - 6 }, end: { x: colX(i), y: y - extra - 6 }, thickness: 0.5, color: ink }) })
      y -= 16 + extra + (l.kind === 'grand' ? 8 : l.kind === 'total' ? 3 : 0)
    }
    if (t.foot) { y -= 6; para(t.foot, { f: ital, size: 9.5 }) }
    if (t.comment) { y -= 4; para('Comment: ' + t.comment, { f: ital, size: 9.5 }) }
    y -= 4; para('The accompanying accounting policies and notes form part of these financial statements.', { f: ital, size: 8.5, color: mut })
    if (t.key === 'equity' && r.cap?.table.length) shareTable(r.cap)
  }

  // Notes
  if (r.notes.length) {
    section('Notes to the financial statements')
    r.notes.forEach((x, i) => {
      head((i + 2) + '. ' + x.title); para(x.text)
      for (const [a, b] of x.rows ?? []) { ensure(15); page.drawText(clean(a), { x: M + 14, y, size: 10.5, font: reg, color: ink }); page.drawText(clean(b), { x: W - M - reg.widthOfTextAtSize(clean(b), 10.5), y, size: 10.5, font: reg, color: ink }); y -= 15 }
      y -= 6
    })
  }

  // Contents, footers
  let cy = contentsY
  for (const s of starts) { contentsPage.drawText(clean(s.title), { x: M, y: cy, size: 11, font: reg, color: ink }); const pn = String(s.page); contentsPage.drawText(pn, { x: W - M - reg.widthOfTextAtSize(pn, 11), y: cy, size: 11, font: reg, color: ink }); contentsPage.drawLine({ start: { x: M, y: cy - 6 }, end: { x: W - M, y: cy - 6 }, thickness: 0.3, color: rule }); cy -= 24 }
  pages.forEach((pg, i) => { if (i === 0) return; const t = String(i + 1); pg.drawText(t, { x: pg.getWidth() / 2 - reg.widthOfTextAtSize(t, 9) / 2, y: 30, size: 9, font: reg, color: mut }); if (r.unaudited) pg.drawText('Unaudited', { x: pg.getWidth() - M - ital.widthOfTextAtSize('Unaudited', 8.5), y: 30, size: 8.5, font: ital, color: mut }) })
  return pdf.save()
}

// ---- Excel ---------------------------------------------------------------------------------------------------
export async function reportXlsx(r: Report, logo: { data: Buffer; ext: 'png' | 'jpeg' } | null): Promise<Buffer> {
  const { default: Excel } = await import('exceljs')
  const wb = new Excel.Workbook(); wb.creator = r.company
  const NAVY = 'FF0C1A2E', MUT = 'FF6B7280', fmt = '#,##0;(#,##0);"-"'
  const font = { name: 'Instrument Sans', size: 10.5 }
  const sheet = (name: string, title: string, sub?: string) => {
    const ws = wb.addWorksheet(name.slice(0, 31), { views: [{ showGridLines: false }] })
    ws.properties.defaultRowHeight = 16
    ws.getColumn(1).width = 4; ws.getColumn(2).width = 52
    if (logo) { const id = wb.addImage({ buffer: logo.data as unknown as ArrayBuffer, extension: logo.ext }); ws.addImage(id, { tl: { col: 4, row: 0 }, ext: { width: 110, height: 32 } }) }
    ws.getCell('B1').value = r.company.toUpperCase(); ws.getCell('B1').font = { ...font, bold: true, color: { argb: NAVY } }
    ws.getCell('B3').value = title.toUpperCase(); ws.getCell('B3').font = { ...font, bold: true, size: 13, color: { argb: NAVY } }
    if (sub) { ws.getCell('B4').value = sub; ws.getCell('B4').font = { ...font, italic: true, color: { argb: MUT } } }
    return ws
  }
  const text = (ws: import('exceljs').Worksheet, t: string, o: { bold?: boolean; italic?: boolean; width?: number } = {}) => {
    const row = ws.addRow(['', t]); ws.mergeCells(row.number, 2, row.number, 6)
    const c = row.getCell(2); c.alignment = { wrapText: true, vertical: 'top' }; c.font = { ...font, bold: o.bold, italic: o.italic }
    row.height = Math.max(16, 15 * Math.ceil(t.length / (o.width ?? 95)))
  }
  // Cover and contents
  const cv = sheet('Cover', 'Financial statements', 'for the ' + r.period)
  cv.addRow([]); text(cv, (ENG[r.p.engagement] + (r.p.engagement === 'none' ? '' : ': ' + r.p.accountants.filter((a) => a.name).map((a) => a.name).join(', '))), { italic: true })
  if (r.p.cfo.name) text(cv, 'Reviewed by: ' + r.p.cfo.name + ', ' + (r.p.cfo.role || 'Chief Financial Officer'))
  if (r.unaudited) text(cv, 'Unaudited', { italic: true })
  cv.addRow([]); text(cv, 'CONTENTS', { bold: true })
  for (const t of ['Directors and professional advisers', 'Report of the directors', ...(r.p.accountants_report.trim() && (r.p.engagement === 'reviewed' || r.p.engagement === 'audited') ? ['Accountants\' report'] : []), 'Significant accounting policies', ...r.tables.map((x) => x.title), ...(r.notes.length ? ['Notes to the financial statements'] : [])]) text(cv, t)
  // Directors and advisers
  const da = sheet('Directors & advisers', 'Directors and professional advisers')
  da.getColumn(3).width = 60; da.addRow([])
  const kv = (label: string, lines: string[]) => { const ls = lines.filter((l) => l.trim()); if (!ls.length) return; ls.forEach((l, i) => { const row = da.addRow(['', i ? '' : label, l]); row.getCell(2).font = { ...font, bold: true }; row.getCell(3).font = font }); da.addRow([]) }
  const p = r.p
  kv('Directors', p.directors.filter((d) => d.name.trim()).map((d) => d.name + (d.role ? ' - ' + d.role : ''))); kv('Company secretary', [p.secretary]); kv('Chief Financial Officer', [p.cfo.name])
  kv('Registered office', p.registered_office.split('\n')); kv('Other offices', p.other_offices.split('\n'))
  kv(p.engagement === 'audited' ? 'Auditors' : 'Independent accountants', p.accountants.filter((a) => a.name).flatMap((a) => [a.name, ...a.address.split('\n')]))
  kv('Legal counsel', [p.legal_counsel.name, ...p.legal_counsel.address.split('\n')]); kv('Tax advisers', [p.tax_adviser.name, ...p.tax_adviser.address.split('\n')])
  kv('Registered agent', [p.registered_agent.name, ...p.registered_agent.address.split('\n')]); kv('Principal bankers', p.bankers)
  // Directors' report
  const dr = sheet('Directors\' report', 'Report of the directors'); dr.addRow([])
  for (const block of directorsReport(r)) { const [h, ...rest] = block.split('\n'); if (rest.length) { text(dr, h!, { bold: true }); text(dr, rest.join(' ')) } else text(dr, h!); dr.addRow([]) }
  if (r.results.length) { text(dr, 'RESULTS', { bold: true }); for (const x of r.results) { const row = dr.addRow(['', x.label, null, null, null, x.v === null ? null : Math.round(x.v)]); row.getCell(6).numFmt = fmt; row.getCell(2).font = font } dr.addRow([]) }
  if (r.comments.trim()) { text(dr, 'REVIEW OF THE BUSINESS', { bold: true }); for (const b of r.comments.split(/\n{2,}/)) text(dr, b); dr.addRow([]) }
  const dirs = p.directors.filter((d) => d.name.trim())
  if (dirs.length) { text(dr, 'DIRECTORS', { bold: true }); for (const d of dirs) { const row = dr.addRow(['', d.name, d.role]); row.font = font } dr.addRow([]) }
  text(dr, 'ACCOUNTANTS', { bold: true }); text(dr, accountantsLine(r)); dr.addRow([])
  text(dr, 'By order of the board', { italic: true }); if (p.signatory.name) text(dr, p.signatory.name + (p.signatory.role ? ', ' + p.signatory.role : '')); if (p.approved_on) text(dr, longDate(p.approved_on))
  if ((p.engagement === 'reviewed' || p.engagement === 'audited') && p.accountants_report.trim()) { const ar = sheet('Accountants\' report', p.engagement === 'audited' ? 'Independent auditors\' report' : 'Independent accountants\' review report'); ar.addRow([]); for (const b of p.accountants_report.split(/\n{2,}/)) { text(ar, b); ar.addRow([]) } }
  const po = sheet('Accounting policies', 'Significant accounting policies', 'Note 1'); po.addRow([])
  for (const x of r.policies) { text(po, x.title, { bold: true }); text(po, x.text); po.addRow([]) }
  // Statements
  for (const t of r.tables) {
    const ws = sheet(({ balance: 'Balance sheet', operations: 'Operations', equity: 'Changes in equity', cashflow: 'Cash flows' } as Record<string, string>)[t.key] ?? t.title, t.title, t.subtitle)
    ws.getColumn(3).width = 8; r.cols.forEach((_, i) => { ws.getColumn(4 + i).width = 16 })
    ws.addRow([]); const h = ws.addRow(['', '', 'Note', ...r.cols]); h.font = { ...font, bold: true }; h.eachCell((c, i) => { if (i >= 3) c.alignment = { horizontal: 'right' } })
    const h2 = ws.addRow(['', '', '', ...r.cols.map(() => r.currency)]); h2.font = { ...font, color: { argb: MUT }, size: 9 }; h2.eachCell((c, i) => { if (i >= 4) c.alignment = { horizontal: 'right' } })
    for (const l of t.lines) {
      const row = ws.addRow(['', (l.kind === 'sub' ? '    ' : '') + l.label, l.note?.replace('Note ', '') ?? '', ...(l.kind === 'head' ? [] : l.v.map((x) => (x === null ? null : Math.round(x))))])
      row.font = { ...font, bold: l.kind === 'head' || l.kind === 'total' || l.kind === 'grand', italic: l.kind === 'memo', color: l.kind === 'memo' ? { argb: MUT } : undefined }
      row.eachCell((c, i) => { if (i >= 4) c.numFmt = fmt; if (i === 3) c.alignment = { horizontal: 'right' } })
      if (l.kind === 'total' || l.kind === 'grand') r.cols.forEach((_, i) => { row.getCell(4 + i).border = { top: { style: 'thin' }, ...(l.kind === 'grand' ? { bottom: { style: 'double' } } : {}) } })
    }
    if (t.foot) { ws.addRow([]); text(ws, t.foot, { italic: true }) }
    if (t.comment) { ws.addRow([]); text(ws, 'Comment: ' + t.comment, { italic: true }) }
    if (t.key === 'equity' && r.cap?.table.length) {
      const c = r.cap, sh = sheet('Shareholding', 'Shareholding', 'as at ' + longDate(c.as_of) + ', from the cap table')
      sh.getColumn(2).width = 34; for (let i = 3; i <= 10; i++) sh.getColumn(i).width = 15
      sh.addRow([]); const hd = sh.addRow(['', 'Class', 'Authorised', 'Issued and outstanding', 'Available for issue', 'Capital contributed (' + c.currency + ')', '% issued', 'Options and pool', 'Fully diluted', '% fully diluted'])
      hd.font = { ...font, bold: true }; hd.height = 32; hd.eachCell((x, i) => { x.alignment = { wrapText: true, vertical: 'bottom', horizontal: i > 2 ? 'right' : 'left' }; x.border = { bottom: { style: 'thin' } } })
      const put = (vals: (string | number | null)[], o: { bold?: boolean; pct?: number[]; top?: boolean } = {}) => { const row = sh.addRow(['', ...vals]); row.font = { ...font, bold: o.bold }; row.eachCell((x, i) => { if (i > 2) { x.numFmt = (o.pct ?? []).includes(i) ? '0.00%' : '#,##0'; x.alignment = { horizontal: 'right' } } if (o.top && i > 2) x.border = { top: { style: 'thin' } } }); return row }
      for (const kind of ['common', 'preferred', ...new Set(c.table.map((x) => x.kind).filter((k) => k !== 'common' && k !== 'preferred'))]) {
        const rs = c.table.filter((x) => x.kind === kind); if (!rs.length) continue
        put([kind === 'common' ? 'Common stock' : kind === 'preferred' ? 'Preferred stock' : kind], { bold: true })
        for (const x of rs) put(['    ' + x.name + (x.par ? ' (par ' + x.par + ')' : ''), x.authorized, Math.round(x.issued), x.available, Math.round(x.contributed), x.pct / 100, x.options || null, Math.round(x.fd), x.fdpct / 100], { pct: [7, 10] })
      }
      const tot = (k: 'authorized' | 'issued' | 'contributed' | 'options' | 'fd') => c.table.reduce((a, x) => a + (x[k] ?? 0), 0)
      put(['Total stock', c.table.some((x) => x.authorized) ? tot('authorized') : null, Math.round(tot('issued')), null, Math.round(tot('contributed')), 1, tot('options') || null, Math.round(tot('fd')), 1], { bold: true, pct: [7, 10], top: true })
      if (c.conv.length) { sh.addRow([]); put(['SAFEs and convertible notes outstanding'], { bold: true }); for (const v of c.conv) put(['    ' + v.count + ' ' + (v.kind === 'safe' ? 'SAFE' : 'convertible note') + (v.count === 1 ? '' : 's'), null, null, null, Math.round(v.amount)]) }
      sh.addRow([]); put(['Fully diluted shares at ' + longDate(c.as_of), null, null, null, null, null, null, Math.round(tot('fd'))], { bold: true, top: true })
      if (c.start_issued !== null && c.start_date) { sh.addRow([]); text(sh, 'Shares issued and outstanding at ' + longDate(c.start_date) + ': ' + Math.round(c.start_issued).toLocaleString('en-US') + '.') }
      sh.addRow([]); text(sh, 'Options and pool are options granted and outstanding plus shares reserved for the option plan and not yet granted. SAFEs and convertible notes convert on a future financing at terms not yet known, so they are not included in fully diluted shares.', { italic: true })
    }
  }
  if (r.notes.length) {
    const nt = sheet('Notes', 'Notes to the financial statements'); nt.getColumn(3).width = 30; nt.addRow([])
    r.notes.forEach((x, i) => { text(nt, (i + 2) + '. ' + x.title, { bold: true }); text(nt, x.text); for (const [a, b] of x.rows ?? []) { const row = nt.addRow(['', '    ' + a, b]); row.font = font; row.getCell(3).alignment = { horizontal: 'right' } } nt.addRow([]) })
  }
  // Finvry's typeface throughout (Excel falls back to a similar sans-serif where it is not installed).
  wb.eachSheet((ws) => ws.eachRow({ includeEmpty: false }, (row) => row.eachCell({ includeEmpty: false }, (c) => { c.font = { size: 10.5, ...(c.font ?? {}), name: 'Instrument Sans' } })))
  return Buffer.from(await wb.xlsx.writeBuffer())
}
