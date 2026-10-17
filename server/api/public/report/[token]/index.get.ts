// The founder's form data. No login: the link itself is the key.
const QUARTER_LABELS: Record<string, { label: string; hint: string }> = {
  revenue: { label: 'Revenue this quarter', hint: 'Total revenue recognised in the quarter' },
  gross_margin: { label: 'Gross margin', hint: 'For the quarter, as a percentage, e.g. 62' },
  net_burn: { label: 'Net burn per month', hint: 'Average for the quarter: cash out minus cash in; 0 if cash-flow positive' },
  cash: { label: 'Cash in the bank', hint: 'At quarter end' },
  customers: { label: 'Paying customers', hint: 'At quarter end' },
  headcount: { label: 'Headcount', hint: 'Full-time equivalents at quarter end' }
}
export default defineEventHandler(async (event) => {
  const r = await requestFromToken(event)
  if (r.status === 'sent') await db().query("UPDATE portfolio.requests SET opened_at = coalesce(opened_at, now()) WHERE id = $1", [r.id])
  let values: Record<string, number | null> = {}
  let update: Record<string, string> = {}
  let cap: Record<string, unknown> = {}
  const draft = r.draft as { values?: Record<string, number | null>; update?: Record<string, string>; cap?: Record<string, unknown> }
  if (draft.values || draft.update) { values = draft.values ?? {}; update = draft.update ?? {}; cap = draft.cap ?? {} }
  else if (r.status === 'submitted') {
    const v = await db().query<{ metric: string; founder_value: string | null }>('SELECT metric, founder_value::text FROM portfolio.metric_values WHERE company_id = $1 AND period = $2', [r.company_id, r.period])
    values = Object.fromEntries(v.rows.map((x) => [x.metric, x.founder_value === null ? null : Number(x.founder_value)]))
    const u = await db().query<{ highlights: string | null; challenges: string | null; asks: string | null }>('SELECT highlights, challenges, asks FROM portfolio.updates WHERE company_id = $1 AND period = $2', [r.company_id, r.period])
    update = { highlights: u.rows[0]?.highlights ?? '', challenges: u.rows[0]?.challenges ?? '', asks: u.rows[0]?.asks ?? '' }
    const c = (await asPlatform(() => db().query<Record<string, unknown>>("SELECT new_money, kind, round_name, amount::float, price_per_share::float, valuation_cap::float, post_money::float, fd_shares::float, note FROM portfolio.cap_updates WHERE company_id = $1 AND period = $2 AND source = 'report'", [r.company_id, r.period]))).rows[0]
    if (c) cap = { ...c, new_money: c.new_money === true ? 'yes' : c.new_money === false ? (c.note ? 'call' : 'no') : c.note ? 'call' : '' }
  }
  // A company on Finvry: its own figures for the period, offered to fill the form (the founder checks before sending).
  const prefill = Object.values(values).some((v) => v !== null && v !== undefined) ? null : await finvryPrefill(r.company_id, r.period, Number(r.months) === 3 ? 3 : 1).catch(() => null)
  const q = Number(r.months) === 3
  // A quarterly link asks for the quarter: its total revenue, average monthly burn, and the position at quarter end.
  const metrics = q ? METRICS.map((m) => ({ ...m, ...QUARTER_LABELS[m.key] })) : METRICS
  return {
    company: r.company, founderName: r.founder_name, period: r.period.slice(0, 7), periodLabel: q ? requestLabel(r.period, 'quarterly') : periodLabel(r.period), quarterly: q,
    status: r.status, submittedAt: r.submitted_at, expiresAt: r.expires_at, metrics, values, update, cap, prefill, workspace: await publicWorkspace()
  }
})
