// Save the exit assumptions and the buyer list (statuses, notes, removals, buyers added by hand).
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp', 'team')
  await requireModule(event, 'equity')
  const n = (max: number) => z.coerce.number().min(0).max(max)
  const b = z.object({ ct: z.string().uuid().optional(),
    assumptions: z.object({ basis: z.enum(['arr', 'revenue_ttm', 'ebitda_ttm', 'manual']), basis_value: n(1e13).nullable(), currency: z.string().regex(/^[A-Z]{3}$/), multiples: z.object({ worst: n(500), base: n(500), best: n(500) }), rationale: z.string().max(800).default(''), years: n(30).default(3), growth: z.coerce.number().min(-90).max(1000).nullable().default(null), project: z.boolean().default(false), focus: z.string().max(300).default(''), about: z.string().max(600).default('') }).optional(),
    buyers: z.array(z.record(z.string(), z.unknown())).max(60).optional() }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Check the exit figures.')
  const ct = await capTableId(b.data.ct), now = new Date().toISOString()
  const buyers = b.data.buyers ? b.data.buyers.map((x) => { const c = cleanBuyer(x, now); c.status = (['idea', 'shortlist', 'contacted', 'talking', 'passed'].includes(String(x.status)) ? x.status : 'idea') as Buyer['status']; c.notes = String(x.notes ?? '').slice(0, 1000); c.found_at = String(x.found_at ?? now).slice(0, 30); return c }).filter((x) => x.name) : null
  await db().query(`INSERT INTO equity.exit_plans (captable_id, assumptions, buyers) VALUES ($1, coalesce($2::jsonb, '{}'::jsonb), coalesce($3::jsonb, '[]'::jsonb))
    ON CONFLICT (captable_id) DO UPDATE SET assumptions = coalesce($2::jsonb, equity.exit_plans.assumptions), buyers = coalesce($3::jsonb, equity.exit_plans.buyers), updated_at = now()`,
    [ct, b.data.assumptions ? JSON.stringify(b.data.assumptions) : null, buyers ? JSON.stringify(buyers) : null])
  await audit({ event, actorUserId: user.userId, action: 'equity.exit_saved', objectType: 'captable', objectId: ct })
  return { ok: true }
})
