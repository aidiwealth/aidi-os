// Save a marketing plan drafted from a document (/api/growth/plan): a new marketing process with its funnel, channels
// and strategy, or an existing one updated (strategy replaced, new channels added, the funnel kept unless asked), and
// the campaigns added (a campaign with the same name is updated, not doubled).
import { z } from 'zod'
const Plan = z.object({ currency: z.string().regex(/^[A-Z]{3}$/).nullable().optional(), strategy: z.string().max(40000).default(''),
  stages: z.array(z.object({ name: z.string().trim().min(1).max(60), kind: z.enum(['open', 'won', 'lost']), target_pct: z.number().min(0).max(100).nullable().optional(), days: z.number().int().min(0).max(730).nullable().optional(), steps: z.array(z.string().max(200)).max(10).default([]) })).max(15).default([]),
  channels: z.array(z.object({ name: z.string().trim().min(1).max(60), monthly_budget: z.number().min(0).max(1e12).nullable().optional() })).max(20).default([]),
  campaigns: z.array(z.object({ name: z.string().trim().min(1).max(160), channel: z.string().max(60).default(''), status: z.enum(['planned', 'live', 'done']).default('planned'), starts_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(), ends_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(), budget: z.number().min(0).max(1e12).nullable().optional(), goal: z.string().max(300).default(''), steps: z.array(z.string().max(200)).max(10).default([]) })).max(30).default([]) })
export default defineEventHandler(async (event) => {
  await requireKind(event, 'marketing_months')
  const user = await requireRole(event, 'admin', 'gp')
  const b = z.object({ process_id: z.string().uuid().nullable().optional(), replace_funnel: z.boolean().default(false), plan: Plan }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'The draft could not be saved. Build it again.')
  const { plan, process_id } = b.data
  plan.stages = plan.stages.map((x) => ({ ...x, steps: x.steps.map((t) => t.trim()).filter(Boolean) }))
  const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  let id = process_id ?? null
  if (id) {
    const ex = (await db().query<{ currency: string; channels: { key: string; name: string; monthly_budget: number | null; vendor_keys: string[] }[] }>("SELECT currency, channels FROM growth.processes WHERE id = $1 AND kind = 'marketing'", [id])).rows[0]
    if (!ex) throw apiError('not_found', 'Not found', 404)
    // Figures in another currency (a naira plan on a dollar page) are converted at today's rate.
    if (plan.currency && plan.currency !== ex.currency) {
      const k = await fxRate(plan.currency, ex.currency)
      if (!k) throw apiError('invalid', 'Could not convert ' + plan.currency + ' to ' + ex.currency + ' just now. Try again, or build it on the company whose currency it is.')
      const cv = (v: number | null | undefined) => (v === null || v === undefined ? v : Math.round(v * k))
      for (const c of plan.channels) c.monthly_budget = cv(c.monthly_budget)
      for (const c of plan.campaigns) c.budget = cv(c.budget)
    }
    // Channels already there keep their key (their monthly results point at it); budgets follow the plan; new ones are added.
    const channels = ex.channels.map((c) => { const p = plan.channels.find((x) => norm(x.name) === norm(c.name)); return p ? { ...c, monthly_budget: p.monthly_budget ?? c.monthly_budget } : c })
    for (const c of plan.channels) if (!channels.some((x) => norm(x.name) === norm(c.name))) channels.push({ key: '', name: c.name, monthly_budget: c.monthly_budget ?? null, vendor_keys: [] })
    await saveProcess(event, 'marketing', user.userId, { id, strategy: plan.strategy || null, channels: channels.map((c) => ({ ...c, key: c.key || undefined })), ...(b.data.replace_funnel && plan.stages.some((s) => s.kind === 'open') ? { stages: plan.stages } : {}) })
  } else {
    if (!plan.stages.some((s) => s.kind === 'open')) plan.stages.unshift({ name: 'Aware', kind: 'open', target_pct: null, days: null, steps: [] })
    id = (await saveProcess(event, 'marketing', user.userId, { name: 'Marketing', currency: plan.currency ?? undefined, strategy: plan.strategy || null, stages: plan.stages, channels: plan.channels.map((c) => ({ name: c.name, monthly_budget: c.monthly_budget ?? null, vendor_keys: [] })) }) as { id: string }).id
  }
  const keys = (await db().query<{ channels: { key: string; name: string }[] }>('SELECT channels FROM growth.processes WHERE id = $1', [id])).rows[0]?.channels ?? []
  const have = new Map((await db().query<{ id: string; name: string }>('SELECT id, name FROM growth.campaigns WHERE process_id = $1', [id])).rows.map((r) => [norm(r.name), r.id]))
  let added = 0, updated = 0
  for (const c of plan.campaigns) {
    const ch = keys.find((k) => norm(k.name) === norm(c.channel))?.key ?? null, steps = JSON.stringify(c.steps.filter(Boolean).map((t) => ({ text: t.slice(0, 200), done: c.status === 'done' })))
    const args = [c.name, ch, c.status, c.starts_on ?? null, c.ends_on ?? null, c.budget ?? null, c.goal || null, steps]
    const was = have.get(norm(c.name))
    if (was) { await db().query('UPDATE growth.campaigns SET name = $2, channel_key = coalesce($3, channel_key), status = $4, starts_on = coalesce($5, starts_on), ends_on = coalesce($6, ends_on), budget = coalesce($7, budget), goal = coalesce($8, goal), steps = CASE WHEN $9::jsonb = \'[]\'::jsonb THEN steps ELSE $9::jsonb END, updated_at = now() WHERE id = $1', [was, ...args]); updated++ }
    else { await db().query('INSERT INTO growth.campaigns (process_id, name, channel_key, status, starts_on, ends_on, budget, goal, steps) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [id, ...args]); added++ }
  }
  await audit({ event, actorUserId: user.userId, action: 'marketing.plan_applied', objectType: 'growth_process', objectId: id, detail: { channels: plan.channels.length, campaigns: plan.campaigns.length } })
  return { ok: true, id, added, updated }
})
