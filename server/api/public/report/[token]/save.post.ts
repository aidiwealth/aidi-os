// Save a draft (save and continue later) or submit. Submitting again before the link expires replaces the earlier figures.
import { z } from 'zod'
const val = z.number().finite().min(-1e15).max(1e15).nullable().optional()
const Body = z.object({
  values: z.object({ revenue: val, gross_margin: val, net_burn: val, cash: val, customers: val, headcount: val }),
  update: z.object({ highlights: z.string().max(4000).optional(), challenges: z.string().max(4000).optional(), asks: z.string().max(4000).optional() }).default({}),
  submit: z.boolean().default(false),
  // Optional: new money and ownership, so the team's records match the company's.
  cap: z.object({ new_money: z.enum(['no', 'yes', 'call', '']).default(''), kind: z.enum(['priced', 'safe', 'note', 'other', '']).default(''), round_name: z.string().trim().max(80).default(''),
    amount: val, price_per_share: val, valuation_cap: val, post_money: val, fd_shares: val }).optional()
})
export default defineEventHandler(async (event) => {
  const r = await requestFromToken(event)
  await rateLimit('report_save', r.id, 60, 60 * 60 * 1000)
  const b = Body.safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Some numbers are not valid. Use digits only, e.g. 45000.')
  const { values, update, submit, cap } = b.data
  if (!submit) {
    await db().query("UPDATE portfolio.requests SET draft = $2, status = CASE WHEN status = 'submitted' THEN status ELSE 'in_progress' END WHERE id = $1",
      [r.id, JSON.stringify({ values, update, cap })])
    return { ok: true, saved: 'draft' }
  }
  const client = await db().connect()
  try {
    await client.query('BEGIN')
    // A quarter replaces monthly revenue and burn the founder reported inside it (team corrections stay).
    if (Number(r.months) === 3) await client.query(`DELETE FROM portfolio.metric_values WHERE company_id = $1 AND metric IN ('revenue', 'net_burn') AND override_value IS NULL
       AND period > ($2::date - interval '3 months') AND period < $2::date`, [r.company_id, r.period])
    for (const key of METRIC_KEYS) {
      const v = values[key]
      await client.query(
        `INSERT INTO portfolio.metric_values (company_id, period, metric, founder_value, months) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (company_id, period, metric) DO UPDATE SET founder_value = EXCLUDED.founder_value, months = EXCLUDED.months, updated_at = now()`,
        [r.company_id, r.period, key, v ?? null, Number(r.months) === 3 ? 3 : 1])
    }
    await client.query(
      `INSERT INTO portfolio.updates (company_id, period, highlights, challenges, asks) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (company_id, period) DO UPDATE SET highlights = EXCLUDED.highlights, challenges = EXCLUDED.challenges, asks = EXCLUDED.asks, submitted_at = now()`,
      [r.company_id, r.period, update.highlights || null, update.challenges || null, update.asks || null])
    if (cap && (cap.new_money || cap.fd_shares != null)) {
      const pos = (v: number | null | undefined) => (v === null || v === undefined || v < 0 ? null : v)
      await client.query(`INSERT INTO portfolio.cap_updates (organization_id, company_id, period, source, new_money, kind, round_name, amount, price_per_share, valuation_cap, post_money, fd_shares, note)
        SELECT c.organization_id, c.id, $2, 'report', $3, $4, $5, $6, $7, $8, $9, $10, $11 FROM portfolio.companies c WHERE c.id = $1
        ON CONFLICT (company_id, period, source) DO UPDATE SET new_money = EXCLUDED.new_money, kind = EXCLUDED.kind, round_name = EXCLUDED.round_name, amount = EXCLUDED.amount, price_per_share = EXCLUDED.price_per_share, valuation_cap = EXCLUDED.valuation_cap, post_money = EXCLUDED.post_money, fd_shares = EXCLUDED.fd_shares, note = EXCLUDED.note, created_at = now()`,
        [r.company_id, r.period, cap.new_money === 'yes' ? true : cap.new_money === 'no' ? false : null, cap.new_money === 'yes' && cap.kind ? cap.kind : null, cap.round_name || null, pos(cap.amount), pos(cap.price_per_share), pos(cap.valuation_cap), pos(cap.post_money), pos(cap.fd_shares), cap.new_money === 'call' ? 'Prefers to share round details on a call' : null])
    }
    await client.query("UPDATE portfolio.requests SET status = 'submitted', submitted_at = now(), draft = '{}'::jsonb WHERE id = $1", [r.id])
    await client.query('INSERT INTO core.audit_log (action, object_type, object_id, detail, ip) VALUES ($1,$2,$3,$4,$5)',
      ['portfolio.report_submitted', 'company', r.company_id, JSON.stringify({ period: r.period }), ipOrNull(event) ?? null])
    await client.query('COMMIT')
  } catch (err) { await client.query('ROLLBACK'); throw err } finally { client.release() }
  sendReportSubmittedAlert(r.company_id, r.company, Number(r.months) === 3 ? requestLabel(r.period, 'quarterly') : periodLabel(r.period)).catch((e) => console.error('[report] alert failed', e))
  return { ok: true, saved: 'submitted' }
})
