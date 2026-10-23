// Add, change or delete a campaign (budget, spend, leads, customers, and its checklist).
import { z } from 'zod'
const n = z.preprocess((v) => (v === '' || v === null || v === undefined ? null : Number(String(v).replace(/[,\s$₦]/g, ''))), z.number().min(0).max(1e12).nullable())
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().or(z.literal('').transform(() => null))
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin', 'gp', 'team')
  const b = z.object({ id: z.string().uuid().optional(), delete: z.boolean().optional(), process_id: z.string().uuid().optional(), name: z.string().trim().min(1).max(160).optional(), channel_key: z.string().max(40).nullable().optional(),
    status: z.enum(['planned', 'live', 'done']).default('planned'), starts_on: day.optional(), ends_on: day.optional(), budget: n.optional(), spend: n.optional(), leads: n.optional(), customers: n.optional(), goal: z.string().trim().max(300).optional(),
    steps: z.array(z.object({ text: z.string().trim().min(1).max(200), done: z.boolean().default(false) })).max(30).default([]), notes: z.string().max(4000).optional() }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Check the campaign: a name, dates and numbers.')
  const d = b.data
  if (d.delete && d.id) { await db().query('DELETE FROM growth.campaigns WHERE id = $1', [d.id]); return { ok: true } }
  if (!d.name) throw apiError('invalid', 'Name the campaign.')
  const i = (v: number | null | undefined) => (v === null || v === undefined ? null : Math.round(v))
  const args = [d.name, d.channel_key || null, d.status, d.starts_on ?? null, d.ends_on ?? null, d.budget ?? null, d.spend ?? null, i(d.leads), i(d.customers), d.goal || null, JSON.stringify(d.steps), d.notes || null]
  if (d.id) { await db().query('UPDATE growth.campaigns SET name = $2, channel_key = $3, status = $4, starts_on = $5, ends_on = $6, budget = $7, spend = $8, leads = $9, customers = $10, goal = $11, steps = $12, notes = $13, updated_at = now() WHERE id = $1', [d.id, ...args]); return { ok: true, id: d.id } }
  if (!d.process_id || !(await db().query("SELECT 1 FROM growth.processes WHERE id = $1 AND kind = 'marketing'", [d.process_id])).rowCount) throw apiError('not_found', 'Not found', 404)
  const id = (await one<{ id: string }>('INSERT INTO growth.campaigns (process_id, name, channel_key, status, starts_on, ends_on, budget, spend, leads, customers, goal, steps, notes) VALUES ($13,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id', [...args, d.process_id])).id
  return { ok: true, id }
})
