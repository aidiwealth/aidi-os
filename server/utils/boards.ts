// Financial boards: defaults per audience and the figures behind them.
import { addMonths, run, type Assumptions } from '~/shared/forecast'
export const BOARD_METRICS: Record<string, { label: string; unit: 'money' | 'pct' | 'months' }> = {
  revenue: { label: 'Revenue', unit: 'money' }, growth: { label: 'Revenue growth', unit: 'pct' }, gross_profit: { label: 'Gross profit', unit: 'money' }, gross_margin: { label: 'Gross margin', unit: 'pct' },
  opex_total: { label: 'Operating costs', unit: 'money' }, ebitda: { label: 'EBITDA', unit: 'money' }, net_income: { label: 'Net income', unit: 'money' }, cash: { label: 'Cash', unit: 'money' },
  burn: { label: 'Monthly burn', unit: 'money' }, runway: { label: 'Runway', unit: 'months' }, total_assets: { label: 'Total assets', unit: 'money' }, equity: { label: 'Equity', unit: 'money' },
  ltm_growth: { label: 'LTM revenue growth', unit: 'pct' }, ntm_growth: { label: 'NTM revenue growth', unit: 'pct' } }
export interface BoardChart { title: string; metrics: string[]; type?: 'line' | 'bar' | 'area' | 'pie' | 'table' }
export const DEFAULT_BOARDS: { audience: string; name: string; sort: number; kpis: string[]; charts: BoardChart[]; note: string }[] = [
  { audience: 'cfo', name: 'CFO', sort: 0, kpis: ['cash', 'burn', 'runway', 'gross_margin', 'ebitda', 'net_income'], note: 'Cash, spend and margins for running the numbers.',
    charts: [{ title: 'Revenue and operating costs', metrics: ['revenue', 'opex_total'] }, { title: 'Cash', metrics: ['cash'] }, { title: 'Monthly burn', metrics: ['burn'] }, { title: 'Gross margin', metrics: ['gross_margin'] }] },
  { audience: 'executive', name: 'Executive', sort: 1, kpis: ['revenue', 'growth', 'gross_margin', 'ebitda', 'runway', 'cash'], note: 'Growth and profitability at a glance.',
    charts: [{ title: 'Revenue', metrics: ['revenue'] }, { title: 'EBITDA and net income', metrics: ['ebitda', 'net_income'] }] },
  { audience: 'team', name: 'Team', sort: 2, kpis: ['revenue', 'growth', 'runway'], note: 'What the whole team should know: growth and how long the money lasts.',
    charts: [{ title: 'Revenue', metrics: ['revenue'] }] },
  { audience: 'investor', name: 'Investors', sort: 3, kpis: ['revenue', 'growth', 'gross_margin', 'burn', 'runway', 'cash'], note: 'The figures investors ask for. Share it with a private link.',
    charts: [{ title: 'Revenue', metrics: ['revenue'] }, { title: 'Monthly burn', metrics: ['burn'] }, { title: 'Cash', metrics: ['cash'] }] }]
export async function ensureBoards(): Promise<void> {
  if ((await db().query('SELECT 1 FROM financials.boards LIMIT 1')).rowCount) return
  for (const b of DEFAULT_BOARDS) await db().query('INSERT INTO financials.boards (audience, name, sort, kpis, charts, note, sections) VALUES ($1,$2,$3,$4,$5,$6,$7)', [b.audience, b.name, b.sort, b.kpis, JSON.stringify(b.charts), b.note, JSON.stringify(b.audience === 'cfo' ? { forecast: true, statements: true } : {})])
}
// Series for a board's metrics (growth is derived from revenue). Values follow the reporting currency.
// Any metric a board can show: the standard ones, plus customer and KPI metrics.
export function boardMetric(k: string): { label: string; unit: string } { return BOARD_METRICS[k] ?? { label: metricLabel(k), unit: metricUnit(k) } }
// Revenue growth over twelve months, at the end of each period on a board.
// LTM: revenue in the last 12 months against the 12 months before (all 24 months must have figures).
// NTM: the forecast's revenue for the next 12 months against the last 12 months of actual revenue (see boardForecast:
// the forecast for the company or group being viewed, whether or not the board shows it). Months the forecast does not
// cover leave the figure blank.
async function twelveMonthGrowth(ends: string[], subject: string | null | undefined, fc: Map<string, number>) {
  const m = await metricSeries(['revenue'], 'month', 36, subject)
  const rev = new Map<string, number>()
  const vals = m.series.find((x) => x.key === 'revenue')?.values ?? []
  for (const [i, e] of (m.ends ?? []).entries()) { const v = vals[i]; if (typeof v === 'number') rev.set(e, v) }
  const sum = (from: string, n: number, src: Map<string, number>) => { let t = 0; for (let i = 0; i < n; i++) { const v = src.get(addMonths(from, i)); if (v == null) return null; t += v } return t }
  const pct = (now: number | null, before: number | null) => (now != null && before != null && before > 0 ? Math.round((now / before - 1) * 1000) / 10 : null)
  return {
    ltm: ends.map((e) => pct(sum(addMonths(e, -11), 12, rev), sum(addMonths(e, -23), 12, rev))),
    ntm: ends.map((e) => pct(sum(addMonths(e, 1), 12, fc), sum(addMonths(e, -11), 12, rev)))
  }
}
export async function boardData(kpis: string[], charts: BoardChart[], period: string, count: number, subject?: string | null, chosen?: ChosenForecast | null) {
  const want = [...new Set([...kpis, ...charts.flatMap((c) => c.metrics)].flatMap((m) => (m === 'growth' ? ['revenue'] : m === 'ltm_growth' || m === 'ntm_growth' ? [] : [m])))]
  const s = await metricSeries(want, period, count + 1, subject)
  const get = (k: string) => s.series.find((x) => x.key === k)?.values ?? []
  const rev = get('revenue')
  const growth = rev.map((v, i) => (i && v != null && rev[i - 1] ? Math.round(((v - rev[i - 1]!) / Math.abs(rev[i - 1]!)) * 1000) / 10 : null))
  const all = [...kpis, ...charts.flatMap((c) => c.metrics)]
  const tw = all.some((k) => k === 'ltm_growth' || k === 'ntm_growth') ? await twelveMonthGrowth(s.ends ?? [], subject, (await boardForecast(subject, chosen, s.currency))?.revenue ?? new Map()) : null
  const val = (k: string) => (k === 'growth' ? growth : k === 'ltm_growth' ? tw!.ltm : k === 'ntm_growth' ? tw!.ntm : get(k))
  const labels = s.labels.slice(1)
  const series: Record<string, (number | null)[]> = {}
  for (const k of new Set([...kpis, ...charts.flatMap((c) => c.metrics)])) series[k] = val(k).slice(1)
  const kpiCards = kpis.map((k) => { const v = val(k).filter((x): x is number => x != null); const last = v[v.length - 1] ?? null, prev = v[v.length - 2] ?? null
    const def = boardMetric(k)
    return { key: k, label: def.label, unit: def.unit, value: last, prev, change: last != null && prev != null && prev !== 0 && def.unit === 'money' ? Math.round(((last - prev) / Math.abs(prev)) * 1000) / 10 : last != null && prev != null && def.unit !== 'money' ? Math.round((last - prev) * 10) / 10 : null } })
  const defs = Object.fromEntries([...new Set([...kpis, ...charts.flatMap((c) => c.metrics)])].map((k) => [k, boardMetric(k)]))
  return { labels, series, kpis: kpiCards, charts, currency: s.currency, period, defs }
}

// The forecast for what a board is showing. The group (chosen at the top) uses the group forecast: every company's main
// forecast in the reporting currency. One company uses the forecast picked on the board when it is that company's,
// else that company's main forecast. Used for the board's forecast panel and for NTM revenue growth (NTM uses it even
// when the board does not show a forecast). A forecast in another currency than the board's figures is not used for NTM.
export interface ChosenForecast { id: string; name: string; entity_id: string | null; assumptions: unknown }
export interface BoardForecast { name: string; group: boolean; id: string | null; assumptions: unknown | null; pack: { currency: string; months: number; base: unknown; best: unknown; worst: unknown; cats?: unknown[]; lines?: { key: string; label: string }[] } | null; revenue: Map<string, number> }
export async function boardForecast(subject: string | null | undefined, chosen: ChosenForecast | null | undefined, currency?: string): Promise<BoardForecast | null> {
  const ent = subject?.startsWith('entity:') ? subject.slice(7) : null
  const rev = (months: { month: string; revenue: number }[], cur: string) => new Map(!currency || cur === currency ? months.map((x) => [x.month, x.revenue] as [string, number]) : [])
  const mine = chosen && (subject !== 'group') && (!ent || chosen.entity_id === ent) ? chosen : null
  if (mine) {
    const a = mine.assumptions as Assumptions | null
    let months: { month: string; revenue: number }[] = []
    if (a && Array.isArray(a.costs)) { try { months = run(a).months } catch { /* a forecast that cannot run gives no NTM */ } }
    return { name: mine.name, group: false, id: mine.id, assumptions: mine.assumptions, pack: null, revenue: rev(months, a?.currency || currency || '') }
  }
  const p = await forecastPack({ subject: subject ?? undefined, currency }).catch(() => null)
  if (!p) return null
  return { name: p.companies > 1 ? 'Group forecast' : p.name, group: p.companies > 1, id: null, assumptions: p.companies > 1 ? null : p.a,
    pack: p.companies > 1 ? { currency: p.currency, months: p.months, base: p.base, best: p.best, worst: p.worst, cats: p.cats, lines: p.lines } : null, revenue: rev(p.base.months, p.currency) }
}

// Reports attached to a board (newest first): title, type and size, for the board's Reports card.
export async function boardReports(ids: string[] | null | undefined): Promise<{ id: string; title: string; mime_type: string; size_bytes: number; created_at: string }[]> {
  if (!ids?.length) return []
  return (await db().query<{ id: string; title: string; mime_type: string; size_bytes: number; created_at: string }>(
    'SELECT id, title, mime_type, size_bytes, created_at FROM core.documents WHERE id = ANY($1::uuid[]) ORDER BY created_at DESC', [ids])).rows
}
