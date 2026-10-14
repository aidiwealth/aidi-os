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
  const b = z.object({ id: z.string().uuid().optional(), delete: z.boolean().optional(), name: z.string().trim().min(1).max(120).optional(), assumptions: A.optional() }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Check the forecast assumptions: ' + (b.error.issues[0]?.path.join('.') ?? ''))
  const d = b.data
  if (d.delete && d.id) { await db().query('DELETE FROM financials.forecasts WHERE id = $1', [d.id]); return { ok: true } }
  if (!d.name || !d.assumptions) throw apiError('invalid', 'Name the forecast.')
  const id = d.id
    ? ((await db().query('UPDATE financials.forecasts SET name = $2, assumptions = $3, updated_at = now() WHERE id = $1', [d.id, d.name, JSON.stringify(d.assumptions)])).rowCount ? d.id : null)
    : (await one<{ id: string }>('INSERT INTO financials.forecasts (name, assumptions, created_by) VALUES ($1,$2,$3) RETURNING id', [d.name, JSON.stringify(d.assumptions), user.userId])).id
  if (!id) throw apiError('not_found', 'Not found', 404)
  return { ok: true, id }
})
