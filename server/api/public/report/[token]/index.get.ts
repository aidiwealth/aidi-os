// The founder's form data. No login: the link itself is the key.
export default defineEventHandler(async (event) => {
  const r = await requestFromToken(event)
  if (r.status === 'sent') await db().query("UPDATE portfolio.requests SET opened_at = coalesce(opened_at, now()) WHERE id = $1", [r.id])
  let values: Record<string, number | null> = {}
  let update: Record<string, string> = {}
  const draft = r.draft as { values?: Record<string, number | null>; update?: Record<string, string> }
  if (draft.values || draft.update) { values = draft.values ?? {}; update = draft.update ?? {} }
  else if (r.status === 'submitted') {
    const v = await db().query<{ metric: string; founder_value: string | null }>('SELECT metric, founder_value::text FROM portfolio.metric_values WHERE company_id = $1 AND period = $2', [r.company_id, r.period])
    values = Object.fromEntries(v.rows.map((x) => [x.metric, x.founder_value === null ? null : Number(x.founder_value)]))
    const u = await db().query<{ highlights: string | null; challenges: string | null; asks: string | null }>('SELECT highlights, challenges, asks FROM portfolio.updates WHERE company_id = $1 AND period = $2', [r.company_id, r.period])
    update = { highlights: u.rows[0]?.highlights ?? '', challenges: u.rows[0]?.challenges ?? '', asks: u.rows[0]?.asks ?? '' }
  }
  return {
    company: r.company, founderName: r.founder_name, period: r.period.slice(0, 7), periodLabel: periodLabel(r.period),
    status: r.status, submittedAt: r.submitted_at, expiresAt: r.expires_at, metrics: METRICS, values, update, workspace: await publicWorkspace()
  }
})
