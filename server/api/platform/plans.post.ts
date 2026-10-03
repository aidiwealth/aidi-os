// Create or update a plan: modules included, limits and list prices. Changes apply to every workspace on the plan.
import { z } from 'zod'
const num = z.union([z.coerce.number().min(0).max(1e9), z.literal('').transform(() => null), z.null()]).optional()
const Body = z.object({
  code: z.string().regex(/^[a-z][a-z0-9_]{1,30}$/), name: z.string().trim().min(1).max(80), description: z.string().trim().max(300).optional(),
  modules: z.array(z.string()).max(50), seat_limit: num, storage_gb: num, ai_runs_month: num, price_monthly: num, price_annual: num,
  public: z.boolean().default(true), active: z.boolean().default(true), sort: z.coerce.number().int().min(0).max(99).default(5)
})
export default defineEventHandler(async (event) => {
  const staff = await requirePlatform(event, true)
  const b = Body.safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Check the plan code, name and numbers.')
  const d = b.data
  const known = new Set(MODULES.filter((m) => m.switchable).map((m) => m.code))
  const mods = [...new Set(d.modules.filter((m) => known.has(m)))]
  await asPlatform(() => db().query(
    `INSERT INTO core.plans (code, name, description, modules, seat_limit, storage_gb, ai_runs_month, price_monthly_usd, price_annual_usd, public, active, sort)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, modules = EXCLUDED.modules, seat_limit = EXCLUDED.seat_limit,
       storage_gb = EXCLUDED.storage_gb, ai_runs_month = EXCLUDED.ai_runs_month, price_monthly_usd = EXCLUDED.price_monthly_usd, price_annual_usd = EXCLUDED.price_annual_usd,
       public = EXCLUDED.public, active = EXCLUDED.active, sort = EXCLUDED.sort`,
    [d.code, d.name, d.description || null, mods, d.seat_limit ?? null, d.storage_gb ?? null, d.ai_runs_month ?? null, d.price_monthly ?? null, d.price_annual ?? null, d.public, d.active, d.sort]))
  clearModuleCache()
  await platformAudit(event, staff.userId, 'plan_save', null, { code: d.code, modules: mods.length })
  return { ok: true }
})
