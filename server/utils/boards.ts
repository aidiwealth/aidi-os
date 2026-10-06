// Financial boards: defaults per audience and the figures behind them.
export const BOARD_METRICS: Record<string, { label: string; unit: 'money' | 'pct' | 'months' }> = {
  revenue: { label: 'Revenue', unit: 'money' }, growth: { label: 'Revenue growth', unit: 'pct' }, gross_profit: { label: 'Gross profit', unit: 'money' }, gross_margin: { label: 'Gross margin', unit: 'pct' },
  opex_total: { label: 'Operating costs', unit: 'money' }, ebitda: { label: 'EBITDA', unit: 'money' }, net_income: { label: 'Net income', unit: 'money' }, cash: { label: 'Cash', unit: 'money' },
  burn: { label: 'Monthly burn', unit: 'money' }, runway: { label: 'Runway', unit: 'months' }, total_assets: { label: 'Total assets', unit: 'money' }, equity: { label: 'Equity', unit: 'money' } }
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
  for (const b of DEFAULT_BOARDS) await db().query('INSERT INTO financials.boards (audience, name, sort, kpis, charts, note) VALUES ($1,$2,$3,$4,$5,$6)', [b.audience, b.name, b.sort, b.kpis, JSON.stringify(b.charts), b.note])
}
// Series for a board's metrics (growth is derived from revenue). Values follow the reporting currency.
export async function boardData(kpis: string[], charts: BoardChart[], period: string, count: number) {
  const want = [...new Set([...kpis, ...charts.flatMap((c) => c.metrics)].flatMap((m) => (m === 'growth' ? ['revenue'] : [m])))]
  const s = await metricSeries(want, period, count + 1)
  const get = (k: string) => s.series.find((x) => x.key === k)?.values ?? []
  const rev = get('revenue')
  const growth = rev.map((v, i) => (i && v != null && rev[i - 1] ? Math.round(((v - rev[i - 1]!) / Math.abs(rev[i - 1]!)) * 1000) / 10 : null))
  const val = (k: string) => (k === 'growth' ? growth : get(k))
  const labels = s.labels.slice(1)
  const series: Record<string, (number | null)[]> = {}
  for (const k of new Set([...kpis, ...charts.flatMap((c) => c.metrics)])) series[k] = val(k).slice(1)
  const kpiCards = kpis.map((k) => { const v = val(k).filter((x): x is number => x != null); const last = v[v.length - 1] ?? null, prev = v[v.length - 2] ?? null
    return { key: k, label: BOARD_METRICS[k]?.label ?? k, unit: BOARD_METRICS[k]?.unit ?? 'money', value: last, prev, change: last != null && prev != null && prev !== 0 && BOARD_METRICS[k]?.unit === 'money' ? Math.round(((last - prev) / Math.abs(prev)) * 1000) / 10 : last != null && prev != null && BOARD_METRICS[k]?.unit !== 'money' ? Math.round((last - prev) * 10) / 10 : null } })
  return { labels, series, kpis: kpiCards, charts, currency: s.currency, period }
}
