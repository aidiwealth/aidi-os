// Save an approved report: monthly figures (in US dollars) and founder notes for the report's last period, plus a
// record of the import. Corrections the team made earlier stay; only the reported (founder) values are filled in.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  const b = z.object({ document_id: z.string().uuid(), report: ReportSchema, rate: z.coerce.number().positive().max(1e7), notes: z.boolean().default(true) }).safeParse(await readBody(event))
  if (!id.success || !b.success) throw apiError('invalid', 'Check the figures and the exchange rate.')
  if (!(await db().query('SELECT 1 FROM portfolio.companies WHERE id = $1', [id.data])).rowCount) throw apiError('not_found', 'Company not found', 404)
  const r = b.data.report, rate = r.currency === 'USD' ? 1 : b.data.rate
  const vals = toMonthly(r, rate)
  for (const v of vals) await db().query('INSERT INTO portfolio.metric_values (company_id, period, metric, founder_value) VALUES ($1,$2,$3,$4) ON CONFLICT (company_id, period, metric) DO UPDATE SET founder_value = EXCLUDED.founder_value, updated_at = now()', [id.data, v.period, v.metric, v.value])
  const ends = r.periods.map((p) => p.month).sort(), lastMonth = ends[ends.length - 1] ?? null
  const kpis = r.other_kpis.length ? '\n\nOther figures: ' + r.other_kpis.map((k) => k.name + ' ' + k.value.toLocaleString('en-US') + ' ' + k.unit + (k.period ? ' (' + k.period + ')' : '')).join('; ') : ''
  if (b.data.notes && lastMonth && (r.highlights || r.challenges || r.asks || kpis)) {
    const tag = 'From report "' + r.title + '": '
    await db().query(`INSERT INTO portfolio.updates (company_id, period, highlights, challenges, asks) VALUES ($1, $2, nullif($3, ''), nullif($4, ''), nullif($5, ''))
      ON CONFLICT (company_id, period) DO UPDATE SET highlights = coalesce(nullif(EXCLUDED.highlights, ''), portfolio.updates.highlights), challenges = coalesce(nullif(EXCLUDED.challenges, ''), portfolio.updates.challenges), asks = coalesce(nullif(EXCLUDED.asks, ''), portfolio.updates.asks)`,
      [id.data, lastMonth + '-01', r.highlights ? tag + r.highlights + kpis : kpis ? tag + kpis.trim() : '', r.challenges, r.asks])
  }
  const row = await one<{ id: string }>(`INSERT INTO portfolio.report_imports (company_id, document_id, title, period_label, period_end, currency, usd_rate, months, values_saved, extracted, imported_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`, [id.data, b.data.document_id, r.title, r.period_label || null, lastMonth ? lastMonth + '-01' : null, r.currency, rate, new Set(vals.map((v) => v.period)).size, vals.length, JSON.stringify(r), user.userId])
  await audit({ event, actorUserId: user.userId, action: 'portfolio.report_import', objectType: 'company', objectId: id.data, detail: { import: row.id, values: vals.length } })
  return { ok: true, values: vals.length, months: new Set(vals.map((v) => v.period)).size }
})
