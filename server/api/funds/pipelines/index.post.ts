// Create or edit an LP pipeline: a fund raise (tied to a fund), a debt facility, or a co-investment / SPV (tied to
// a deal's round and, once invested, the portfolio company). New pipelines get stages for their kind.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  const b = z.object({ id: z.string().uuid().optional(), name: z.string().trim().min(1).max(120), kind: z.enum(['fund', 'debt', 'co_invest']).default('fund'),
    fund_id: z.string().uuid().nullable().optional(), deal_id: z.string().uuid().nullable().optional(), company_id: z.string().uuid().nullable().optional(),
    currency: z.string().regex(/^[A-Z]{3}$/).default('USD'), target: z.coerce.number().min(0).max(1e13).nullable().optional(), target_close: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional().or(z.literal('').transform(() => null)),
    interest_pct: z.coerce.number().min(0).max(99).nullable().optional(), tenor_months: z.coerce.number().int().min(1).max(600).nullable().optional(), status: z.enum(['open', 'closed']).default('open'), notes: z.string().max(2000).optional() }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Name the pipeline and check the figures.')
  const d = b.data
  const chk = async (sql: string, v?: string | null) => (v && !(await db().query(sql, [v])).rowCount ? null : v ?? null)
  const fund = await chk('SELECT 1 FROM funds.funds WHERE id = $1', d.fund_id), deal = await chk('SELECT 1 FROM deals.deals WHERE id = $1', d.deal_id), company = await chk('SELECT 1 FROM portfolio.companies WHERE id = $1', d.company_id)
  if (d.kind === 'fund' && !fund) throw apiError('invalid', 'Choose the fund this raise is for.')
  if (d.kind === 'co_invest' && !deal && !company) throw apiError('invalid', 'Choose the deal or portfolio company for the co-investment.')
  const vals = [d.name, d.kind, fund, deal, company, d.currency, d.target ?? null, d.target_close ?? null, d.kind === 'debt' ? d.interest_pct ?? null : null, d.kind === 'debt' ? d.tenor_months ?? null : null, d.status, d.notes ?? null]
  if (d.id) {
    const x = await db().query('UPDATE funds.lp_pipelines SET name=$2, kind=$3, fund_id=$4, deal_id=$5, company_id=$6, currency=$7, target=$8, target_close=$9, interest_pct=$10, tenor_months=$11, status=$12, notes=coalesce($13, notes) WHERE id=$1', [d.id, ...vals])
    if (!x.rowCount) throw apiError('not_found', 'Not found', 404)
    return { ok: true, id: d.id }
  }
  const id = (await one<{ id: string }>('INSERT INTO funds.lp_pipelines (name, kind, fund_id, deal_id, company_id, currency, target, target_close, interest_pct, tenor_months, status, notes, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id', [...vals, user.userId])).id
  for (const [i, [name, , kind]] of LP_STAGE_SETS[d.kind]!.entries()) await db().query('INSERT INTO funds.lp_stages (pipeline_id, name, kind, sort) VALUES ($1,$2,$3,$4)', [id, name, kind, i])
  await audit({ event, actorUserId: user.userId, action: 'funds.lp_pipeline_created', objectType: 'lp_pipeline', objectId: id, detail: { kind: d.kind } })
  return { ok: true, id }
})
