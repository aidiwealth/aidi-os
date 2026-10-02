import { z } from 'zod'
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw apiError('not_found', 'Company not found', 404)
  const c = await db().query('SELECT c.id, c.name, c.founder_name, c.founder_email, c.deal_id, c.relationship, he.name AS holder FROM portfolio.companies c LEFT JOIN core.entities he ON he.id = c.holding_entity_id WHERE c.id = $1', [id.data])
  if (c.rowCount !== 1) throw apiError('not_found', 'Company not found', 404)
  const v = await db().query<{ period: string; metric: string; founder_value: string | null; override_value: string | null; override_note: string | null; override_by: string | null }>(
    `SELECT to_char(m.period, 'YYYY-MM-DD') AS period, m.metric, m.founder_value::text, m.override_value::text, m.override_note, p.full_name AS override_by
       FROM portfolio.metric_values m LEFT JOIN core.users u ON u.id = m.override_by LEFT JOIN core.people p ON p.id = u.person_id
      WHERE m.company_id = $1 ORDER BY m.period`, [id.data])
  const byPeriod = new Map<string, MonthRow & { raw: Record<string, { founder: number | null; override: number | null; note: string | null; by: string | null }> }>()
  for (const r of v.rows) {
    const row = byPeriod.get(r.period) ?? { period: r.period, values: {}, raw: {} }
    const f = r.founder_value === null ? null : Number(r.founder_value), o = r.override_value === null ? null : Number(r.override_value)
    row.values[r.metric] = o ?? f
    row.raw[r.metric] = { founder: f, override: o, note: r.override_note, by: r.override_by }
    byPeriod.set(r.period, row)
  }
  const months = [...byPeriod.values()].sort((a, b) => a.period.localeCompare(b.period))
  const updates = await db().query(`SELECT to_char(period, 'YYYY-MM-DD') AS period, highlights, challenges, asks, submitted_at FROM portfolio.updates WHERE company_id = $1 ORDER BY period DESC`, [id.data])
  const requests = await db().query(`SELECT to_char(period, 'YYYY-MM-DD') AS period, status, sent_at, opened_at, submitted_at, expires_at, file_document_id FROM portfolio.requests WHERE company_id = $1 ORDER BY sent_at DESC LIMIT 24`, [id.data])
  return { company: c.rows[0], metrics: METRICS, months, analysis: analyse(months, periodLabel), updates: updates.rows, requests: requests.rows }
})
