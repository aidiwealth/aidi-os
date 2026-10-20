// Save (or delete) a forecast. The assumptions are checked and capped so a forecast always runs.
import { z } from 'zod'
const ym = z.string().regex(/^\d{4}-\d{2}$/)
const num = (min: number, max: number) => z.coerce.number().min(min).max(max)
const OneOff = z.object({ label: z.string().trim().max(80).default(''), month: ym, amount: num(-1e12, 1e12) })
const A = z.object({ start: ym, months: z.coerce.number().int().min(3).max(60), currency: z.string().regex(/^[A-Z]{3}$/),
  opening: z.object({ cash: num(-1e12, 1e12), revenue: num(0, 1e12), customers: num(0, 1e9), headcount: num(0, 1e6), payroll: num(0, 1e12) }),
  revenue: z.object({ mode: z.enum(['growth', 'customers']), growth_pct: num(-100, 1000), new_customers: num(0, 1e9), new_growth_pct: num(-100, 1000), churn_pct: num(0, 100), arpu: num(0, 1e9), arpu_growth_pct: num(-100, 1000) }),
  cogs_pct: num(0, 100), costs: z.array(z.object({ key: z.string().regex(/^[a-z_]{2,30}$/), label: z.string().max(80), amount: num(0, 1e12), growth_pct: num(-100, 1000) })).max(12),
  payroll_raise_pct: num(-100, 100), hires: z.array(z.object({ role: z.string().trim().max(80).default(''), start: ym, monthly_cost: num(0, 1e10) })).max(200),
  items: z.array(OneOff).max(100), funding: z.array(OneOff).max(50), tax_pct: num(0, 100),
  scenarios: z.object({ best: z.object({ growth: num(-100, 100), costs: num(-100, 100) }), worst: z.object({ growth: num(-100, 100), costs: num(-100, 100) }) }),
  fixed: z.record(ym, z.object({ revenue: num(-1e12, 1e12), cogs: num(-1e12, 1e12), payroll: num(-1e12, 1e12), costs: z.record(z.string().regex(/^[a-z_]{2,30}$/), num(-1e12, 1e12)), tax: num(-1e12, 1e12), items: num(-1e12, 1e12), funding: num(-1e12, 1e12), customers: num(0, 1e10), headcount: num(0, 1e7) }).partial()).refine((r) => Object.keys(r).length <= 72, 'Up to 72 months').optional(),
  source: z.object({ file: z.string().max(200), imported_at: z.string().max(40), lines: z.array(z.object({ label: z.string().max(200), maps_to: z.string().max(30) })).max(200) }).optional() })
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp', 'team')
  const b = z.object({ id: z.string().uuid().optional(), delete: z.boolean().optional(), main: z.boolean().optional(), name: z.string().trim().min(1).max(120).optional(), assumptions: A.optional(),
    rates: z.record(z.string().regex(/^[A-Z]{3}$/), z.coerce.number().min(0).max(1e9)).optional() }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Check the forecast assumptions: ' + (b.error.issues[0]?.path.join('.') ?? ''))
  const d = b.data
  const sc = await forecastScope(event)
  // The group forecast's plan rates (units of each company's currency for one unit of the reporting currency); 0 clears.
  if (d.rates) {
    if (!user.roles.some((r) => ['admin', 'gp'].includes(r))) throw apiError('forbidden', 'Only founders and admins can set the plan rates.', 403)
    const cur = ((await currentOrg())!.settings as Record<string, unknown>).forecast_rates as Record<string, number> | undefined
    const next = { ...(cur ?? {}) }
    for (const [k, v] of Object.entries(d.rates)) { if (v > 0) next[k] = v; else delete next[k] }
    await db().query("UPDATE core.organizations SET settings = settings || jsonb_build_object('forecast_rates', $1::jsonb) WHERE id = core.current_org()", [JSON.stringify(next)])
    await audit({ event, actorUserId: user.userId, action: 'forecast.plan_rates', objectType: 'organization', detail: { rates: next } })
    return { ok: true }
  }
  if (sc.group) throw apiError('choose_company', 'Choose the company: each company keeps its own forecasts, and the group adds them together.', 400)
  const ent = sc.entity
  if (d.delete && d.id) { await db().query('DELETE FROM financials.forecasts WHERE id = $1 AND entity_id IS NOT DISTINCT FROM $2::uuid', [d.id, ent]); return { ok: true } }
  // The forecast this company's figures in the group forecast come from.
  if (d.main && d.id) {
    const n = (await db().query('UPDATE financials.forecasts SET is_main = (id = $1) WHERE entity_id IS NOT DISTINCT FROM $2::uuid AND (is_main OR id = $1)', [d.id, ent])).rowCount
    if (!n) throw apiError('not_found', 'Not found', 404)
    return { ok: true, id: d.id }
  }
  if (!d.name || !d.assumptions) throw apiError('invalid', 'Name the forecast.')
  const id = d.id
    ? ((await db().query('UPDATE financials.forecasts SET name = $2, assumptions = $3, updated_at = now() WHERE id = $1 AND entity_id IS NOT DISTINCT FROM $4::uuid', [d.id, d.name, JSON.stringify(d.assumptions), ent])).rowCount ? d.id : null)
    : (await one<{ id: string }>('INSERT INTO financials.forecasts (name, assumptions, created_by, entity_id) VALUES ($1,$2,$3,$4) RETURNING id', [d.name, JSON.stringify(d.assumptions), user.userId, ent])).id
  if (!id) throw apiError('not_found', 'Not found', 404)
  return { ok: true, id }
})
