// A forecast or cap table as a document for the data room: a PDF (summary and tables) or, for a forecast, an Excel
// model with the monthly P&L and cash flow and the assumptions.
import { run, defaults, COST_LINES, type Assumptions } from '~/shared/forecast'
import { table, type Data } from '~/shared/captable'
const n0 = (v: number) => (Math.round(v) === 0 ? '-' : v < 0 ? '(' + Math.abs(Math.round(v)).toLocaleString('en-US') + ')' : Math.round(v).toLocaleString('en-US'))
const mon = (ym: string | null) => (ym ? new Date(ym + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }) : 'not in this forecast')
const money = (v: number, c: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency: c, maximumFractionDigits: 0 }).format(v)

export function forecastMd(name: string, a0: Assumptions): string {
  const a = { ...defaults(a0.start), ...a0 }, c = a.currency
  const sc = (['base', 'best', 'worst'] as const).map((s) => ({ s, r: run(a, s) }))
  const base = sc[0]!.r
  const out = ['# ' + name, '', 'Financial forecast, ' + mon(a.start) + ' to ' + mon(base.months[base.months.length - 1]?.month ?? a.start) + ', in ' + c + '.' + (a.source?.file ? ' Built from ' + a.source.file + ' for the months it covers.' : ''), '', '## Summary', '',
    '| | Base case | Best case | Worst case |', '|---|---|---|---|',
    '| Cash at the end | ' + sc.map((x) => money(x.r.summary.cash_end, c)).join(' | ') + ' |',
    '| Lowest cash | ' + sc.map((x) => money(x.r.summary.min_cash, c) + ' (' + mon(x.r.summary.min_cash_month) + ')').join(' | ') + ' |',
    '| Cash runs out | ' + sc.map((x) => (x.r.summary.zero_cash ? mon(x.r.summary.zero_cash) : 'No')).join(' | ') + ' |',
    '| Break-even | ' + sc.map((x) => mon(x.r.summary.break_even)).join(' | ') + ' |',
    '| Revenue (total) | ' + sc.map((x) => money(x.r.summary.revenue_total, c)).join(' | ') + ' |',
    '| Net income (total) | ' + sc.map((x) => money(x.r.summary.net_total, c)).join(' | ') + ' |',
    '| ARR at the end | ' + sc.map((x) => money(x.r.summary.arr_end, c)).join(' | ') + ' |', '']
  // By quarter (or year when long), so the table fits the page.
  const per = base.months.length > 24 ? 12 : 3
  const groups: (typeof base.months)[] = []
  for (let i = 0; i < base.months.length; i += per) groups.push(base.months.slice(i, i + per))
  const lab = (g: typeof base.months) => (per === 12 ? 'FY ' + g[0]!.month.slice(0, 4) + (g[0]!.month.endsWith('-01') ? '' : '/' + g[g.length - 1]!.month.slice(2, 4)) : 'Q' + (Math.floor((Number(g[0]!.month.slice(5)) - 1) / 3) + 1) + ' ' + g[0]!.month.slice(0, 4))
  const sum = (g: typeof base.months, f: (m: (typeof base.months)[number]) => number) => g.reduce((s, m) => s + f(m), 0)
  for (let k = 0; k < groups.length; k += 8) {
    const gs = groups.slice(k, k + 8)
    out.push('## Profit and loss and cash, ' + (per === 12 ? 'by year' : 'by quarter') + (groups.length > 8 ? ' (' + (k / 8 + 1) + ')' : ''), '', '| ' + c + ' | ' + gs.map(lab).join(' | ') + ' |', '|---|' + gs.map(() => '---').join('|') + '|')
    const row = (l: string, f: (g: typeof base.months) => number) => out.push('| ' + l + ' | ' + gs.map((g) => n0(f(g))).join(' | ') + ' |')
    row('Revenue', (g) => sum(g, (m) => m.revenue)); row('Cost of revenue', (g) => -sum(g, (m) => m.cogs)); row('**Gross profit**', (g) => sum(g, (m) => m.gross_profit))
    row('Payroll', (g) => -sum(g, (m) => m.payroll)); for (const cl of COST_LINES) row(cl.label, (g) => -sum(g, (m) => m.costs[cl.key] ?? 0))
    row('**EBITDA**', (g) => sum(g, (m) => m.ebitda)); row('Tax', (g) => -sum(g, (m) => m.tax)); row('**Net income**', (g) => sum(g, (m) => m.net_income))
    row('One-off items', (g) => sum(g, (m) => m.items)); row('Funding', (g) => sum(g, (m) => m.funding)); row('**Cash at period end**', (g) => g[g.length - 1]!.cash)
    out.push('')
  }
  out.push('## Main assumptions', '', '- Opening cash: ' + money(a.opening.cash, c), '- Revenue: ' + (a.revenue.mode === 'growth' ? a.revenue.growth_pct + '% growth a month' : a.revenue.new_customers + ' new customers a month, ' + a.revenue.churn_pct + '% monthly churn, ' + money(a.revenue.arpu, c) + ' per customer a month'),
    '- Cost of revenue: ' + a.cogs_pct + '% of revenue', '- Payroll today: ' + money(a.opening.payroll, c) + ' a month' + (a.hires.length ? ', plus ' + a.hires.length + ' planned hire' + (a.hires.length === 1 ? '' : 's') : ''),
    ...(a.funding.length ? ['- Funding: ' + a.funding.map((f) => (f.label || 'Funding') + ' ' + money(f.amount, c) + ' in ' + mon(f.month)).join('; ')] : []),
    '- Best and worst case: growth ' + (a.scenarios.best.growth >= 0 ? '+' : '') + a.scenarios.best.growth + ' / ' + a.scenarios.worst.growth + ' points a month, costs ' + (a.scenarios.best.costs >= 0 ? '+' : '') + a.scenarios.best.costs + '% / +' + a.scenarios.worst.costs + '%', '',
    'A forecast is an estimate from the assumptions above, not a promise of results.')
  return out.join('\n')
}

export async function forecastXlsx(name: string, company: string, a0: Assumptions): Promise<Buffer> {
  const { default: Excel } = await import('exceljs')
  const a = { ...defaults(a0.start), ...a0 }, wb = new Excel.Workbook(), fmt = '#,##0;(#,##0);-'
  wb.creator = company
  for (const s of ['base', 'best', 'worst'] as const) {
    const r = run(a, s), ws = wb.addWorksheet(s === 'base' ? 'Base case' : s === 'best' ? 'Best case' : 'Worst case', { views: [{ state: 'frozen', xSplit: 1, ySplit: 3 }] })
    ws.addRow([company + ' · ' + name + ' (' + a.currency + ')']).font = { bold: true, size: 13 }; ws.addRow([])
    const head = ws.addRow(['', ...r.months.map((m) => mon(m.month))]); head.font = { bold: true }
    const rows: [string, (m: (typeof r.months)[number]) => number | null, boolean?][] = [['Revenue', (m) => m.revenue, true], ['Cost of revenue', (m) => -m.cogs], ['Gross profit', (m) => m.gross_profit, true], ['Gross margin %', (m) => m.gross_margin],
      ['Payroll', (m) => -m.payroll], ...COST_LINES.map((cl) => [cl.label, (m: (typeof r.months)[number]) => -(m.costs[cl.key] ?? 0)] as [string, (m: (typeof r.months)[number]) => number]), ['Operating costs', (m) => -m.opex, true], ['EBITDA', (m) => m.ebitda, true], ['Tax', (m) => -m.tax], ['Net income', (m) => m.net_income, true],
      ['One-off items', (m) => m.items], ['Funding', (m) => m.funding], ['Net cash flow', (m) => m.cash_flow, true], ['Cash at month end', (m) => m.cash, true], ['Headcount', (m) => m.headcount], ['ARR', (m) => m.arr]]
    for (const [l, f, b] of rows) { const row = ws.addRow([l, ...r.months.map((m) => f(m))]); if (b) row.font = { bold: true }; row.eachCell((cell, i) => { if (i > 1) cell.numFmt = l.endsWith('%') ? '0.0' : fmt }) }
    ws.getColumn(1).width = 34; for (let i = 2; i <= r.months.length + 1; i++) ws.getColumn(i).width = 12
  }
  const as = wb.addWorksheet('Assumptions'); as.getColumn(1).width = 40; as.getColumn(2).width = 22
  const kv: [string, string | number][] = [['Start month', a.start], ['Months', a.months], ['Currency', a.currency], ['Opening cash', a.opening.cash], ['Revenue this month', a.opening.revenue], ['Revenue model', a.revenue.mode === 'growth' ? 'Growth rate' : 'Customers × price'], ['Monthly growth %', a.revenue.growth_pct], ['Cost of revenue %', a.cogs_pct], ['Payroll today (a month)', a.opening.payroll], ['Yearly raise %', a.payroll_raise_pct], ['Tax on profit %', a.tax_pct],
    ...a.costs.map((x) => [x.label + ' (a month)', x.amount] as [string, number]), ...a.hires.map((h) => ['Hire: ' + (h.role || 'role') + ' from ' + h.start, h.monthly_cost] as [string, number]), ...a.funding.map((f) => ['Funding: ' + (f.label || '') + ' ' + f.month, f.amount] as [string, number]), ...(a.source?.file ? [['Imported from', a.source.file] as [string, string]] : [])]
  for (const r of kv) as.addRow(r)
  return Buffer.from(await wb.xlsx.writeBuffer())
}

export function capTableMd(name: string, d: Data): string {
  const today = new Date().toISOString().slice(0, 10), t = table(d, today)
  const KIND: Record<string, string> = { founder: 'Founder', employee: 'Employee', advisor: 'Advisor', investor: 'Investor', other: 'Other' }
  const pct = (v: number) => (Math.round(v * 100) / 100).toFixed(2) + '%'
  const out = ['# ' + name, '', 'Capitalization table as of ' + new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) + '.', '', '## Summary', '',
    '- Fully diluted shares: ' + n0(t.fd), '- Shares issued and outstanding: ' + n0(t.issued), '- Option pool: ' + n0(t.reserved) + ' reserved, ' + n0(t.granted) + ' granted, ' + n0(t.pool) + ' available', '',
    '## Holders', '', '| Holder | Type | ' + d.classes.map((c) => c.name).join(' | ') + ' | Options | Fully diluted | % FD |', '|---|---|' + d.classes.map(() => '---').join('|') + '|---|---|---|']
  for (const r of [...t.rows].sort((x, y) => y.fd - x.fd)) out.push('| ' + r.holder.name + ' | ' + (KIND[r.holder.kind] ?? 'Other') + ' | ' + d.classes.map((c) => (r.byClass[c.id] ? n0(r.byClass[c.id]!) : '-')).join(' | ') + ' | ' + (r.options ? n0(r.options) : '-') + ' | ' + n0(r.fd) + ' | ' + pct(r.pctFd) + ' |')
  if (t.pool) out.push('| Option pool (available) | | ' + d.classes.map(() => '').join(' | ') + ' | ' + n0(t.pool) + ' | ' + n0(t.pool) + ' | ' + pct(t.pool / t.fd * 100) + ' |')
  out.push('| **Total** | | ' + d.classes.map((c) => n0(d.issuances.filter((i) => i.class_id === c.id).reduce((s, i) => s + i.shares, 0))).join(' | ') + ' | ' + n0(t.granted + t.pool) + ' | ' + n0(t.fd) + ' | 100% |', '')
  const pref = d.classes.filter((c) => c.kind === 'preferred')
  if (pref.length) { out.push('## Share classes', '', '| Class | Preference | Participating | Seniority |', '|---|---|---|---|'); for (const c of pref) out.push('| ' + c.name + ' | ' + c.liq_pref + 'x | ' + (c.participating ? 'Yes' : 'No') + ' | ' + c.seniority + ' |'); out.push('') }
  const conv = d.convertibles.filter((c) => c.status === 'outstanding')
  if (conv.length) {
    out.push('## SAFEs and convertible notes', '', 'Not included in the percentages above until they convert.', '', '| Investor | Type | Amount | Valuation cap | Discount | Dated |', '|---|---|---|---|---|---|')
    for (const c of conv) out.push('| ' + (d.holders.find((h) => h.id === c.holder_id)?.name ?? '') + ' | ' + (c.kind === 'safe' ? (c.post_money ? 'Post-money SAFE' : 'Pre-money SAFE') : 'Convertible note' + (c.interest_pct ? ', ' + c.interest_pct + '% interest' : '')) + ' | ' + money(c.amount, c.currency) + ' | ' + (c.valuation_cap ? money(c.valuation_cap, c.currency) : '-') + ' | ' + (c.discount_pct ? c.discount_pct + '%' : '-') + ' | ' + c.issued_on + ' |')
    out.push('')
  }
  out.push('Confidential. As recorded by the company; check against the share register.')
  return out.join('\n')
}
