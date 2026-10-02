// Save a draft (save and continue later) or submit. Submitting again before the link expires replaces the earlier figures.
import { z } from 'zod'
const val = z.number().finite().min(-1e15).max(1e15).nullable().optional()
const Body = z.object({
  values: z.object({ revenue: val, gross_margin: val, net_burn: val, cash: val, customers: val, headcount: val }),
  update: z.object({ highlights: z.string().max(4000).optional(), challenges: z.string().max(4000).optional(), asks: z.string().max(4000).optional() }).default({}),
  submit: z.boolean().default(false)
})
export default defineEventHandler(async (event) => {
  const r = await requestFromToken(event)
  rateLimit('report_save', r.id, 60, 60 * 60 * 1000)
  const b = Body.safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Some numbers are not valid. Use digits only, e.g. 45000.')
  const { values, update, submit } = b.data
  if (!submit) {
    await db().query("UPDATE portfolio.requests SET draft = $2, status = CASE WHEN status = 'submitted' THEN status ELSE 'in_progress' END WHERE id = $1",
      [r.id, JSON.stringify({ values, update })])
    return { ok: true, saved: 'draft' }
  }
  const client = await db().connect()
  try {
    await client.query('BEGIN')
    for (const key of METRIC_KEYS) {
      const v = values[key]
      await client.query(
        `INSERT INTO portfolio.metric_values (company_id, period, metric, founder_value) VALUES ($1,$2,$3,$4)
         ON CONFLICT (company_id, period, metric) DO UPDATE SET founder_value = EXCLUDED.founder_value, updated_at = now()`,
        [r.company_id, r.period, key, v ?? null])
    }
    await client.query(
      `INSERT INTO portfolio.updates (company_id, period, highlights, challenges, asks) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (company_id, period) DO UPDATE SET highlights = EXCLUDED.highlights, challenges = EXCLUDED.challenges, asks = EXCLUDED.asks, submitted_at = now()`,
      [r.company_id, r.period, update.highlights || null, update.challenges || null, update.asks || null])
    await client.query("UPDATE portfolio.requests SET status = 'submitted', submitted_at = now(), draft = '{}'::jsonb WHERE id = $1", [r.id])
    await client.query('INSERT INTO core.audit_log (action, object_type, object_id, detail, ip) VALUES ($1,$2,$3,$4,$5)',
      ['portfolio.report_submitted', 'company', r.company_id, JSON.stringify({ period: r.period }), getRequestIP(event, { xForwardedFor: true }) ?? null])
    await client.query('COMMIT')
  } catch (err) { await client.query('ROLLBACK'); throw err } finally { client.release() }
  sendReportSubmittedAlert(r.company_id, r.company, periodLabel(r.period)).catch((e) => console.error('[report] alert failed', e))
  return { ok: true, saved: 'submitted' }
})
