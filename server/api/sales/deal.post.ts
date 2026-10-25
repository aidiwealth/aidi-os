// Add, change, move or delete a deal; tick a step. Every move between stages is kept (conversion and cycle time).
import { z } from 'zod'
const amt = z.preprocess((v) => (v === '' || v === null || v === undefined ? null : Number(String(v).replace(/[,\s$₦]/g, ''))), z.number().min(0).max(1e12).nullable())
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp', 'team')
  const b = z.object({ id: z.string().uuid().optional(), delete: z.boolean().optional(), process_id: z.string().uuid().optional(), name: z.string().trim().min(1).max(160).optional(), contact: z.string().trim().max(200).optional(),
    value: amt.optional(), recurring: z.boolean().optional(), stage_key: z.string().max(40).optional(), owner_id: z.string().uuid().nullable().optional(), source_channel: z.string().max(40).nullable().optional(),
    expected_close: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional().or(z.literal('').transform(() => null)), notes: z.string().max(20000).optional(), deal_type: z.enum(['new', 'expansion', 'renewal']).optional(), customer_key: z.string().max(200).nullable().optional(), customer_name: z.string().trim().max(200).nullable().optional(), lost_reason: z.string().trim().max(300).optional(),
    step: z.object({ stage: z.string().max(40), i: z.number().int().min(0).max(19), done: z.boolean() }).optional() }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Check the deal: a name, and a value in numbers.')
  const d = b.data
  if (d.delete && d.id) { await db().query('DELETE FROM growth.deals WHERE id = $1', [d.id]); return { ok: true } }
  const pid = d.process_id ?? (d.id ? (await db().query<{ process_id: string }>('SELECT process_id FROM growth.deals WHERE id = $1', [d.id])).rows[0]?.process_id : undefined)
  const p = pid ? (await db().query<{ stages: { key: string; kind: string }[]; entity_id: string | null }>("SELECT stages, entity_id FROM growth.processes WHERE id = $1 AND kind = 'sales'", [pid])).rows[0] : undefined
  if (!p) throw apiError('not_found', 'That sales process was not found.', 404)
  if (d.stage_key && !p.stages.some((s) => s.key === d.stage_key)) throw apiError('invalid', 'Choose one of the process stages.')
  const closedKind = (k?: string) => p.stages.find((s) => s.key === k)?.kind
  if (!d.id) {
    if (!d.name) throw apiError('invalid', 'Name the deal.')
    // The deal is for the process's company, or (a group-wide process) the company chosen at the top.
    const sc = await forecastScope(event), ent = p.entity_id ?? (sc.group ? null : sc.entity)
    const stage = d.stage_key ?? p.stages.find((s) => s.kind === 'open')!.key
    const id = (await one<{ id: string }>('INSERT INTO growth.deals (process_id, name, contact, value, recurring, stage_key, owner_id, source_channel, expected_close, notes, entity_id, closed_at, deal_type, customer_key, customer_name) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$12, CASE WHEN $11 THEN now() END, $13, $14, $15) RETURNING id',
      [pid, d.name, d.contact || null, d.value ?? null, d.recurring ?? false, stage, d.owner_id ?? user.userId, d.source_channel || null, d.expected_close ?? null, d.notes || null, closedKind(stage) !== 'open', ent, d.deal_type ?? (d.customer_key ? 'expansion' : 'new'), d.customer_key || null, d.customer_name || null])).id
    await db().query('INSERT INTO growth.deal_moves (deal_id, from_stage, to_stage, by_user) VALUES ($1, NULL, $2, $3)', [id, stage, user.userId])
    return { ok: true, id }
  }
  const cur = (await db().query<{ stage_key: string; steps_done: Record<string, number[]> }>('SELECT stage_key, steps_done FROM growth.deals WHERE id = $1', [d.id])).rows[0]
  if (!cur) throw apiError('not_found', 'Not found', 404)
  if (d.step) { const s = new Set(cur.steps_done[d.step.stage] ?? []); if (d.step.done) s.add(d.step.i); else s.delete(d.step.i); await db().query('UPDATE growth.deals SET steps_done = jsonb_set(steps_done, ARRAY[$2::text], $3::jsonb), updated_at = now() WHERE id = $1', [d.id, d.step.stage, JSON.stringify([...s].sort())]) }
  const set: string[] = [], vals: unknown[] = [d.id]
  const put = (col: string, v: unknown) => { vals.push(v); set.push(col + ' = $' + vals.length) }
  if (d.name !== undefined) put('name', d.name); if (d.contact !== undefined) put('contact', d.contact || null); if (d.value !== undefined) put('value', d.value); if (d.recurring !== undefined) put('recurring', d.recurring)
  if (d.owner_id !== undefined) put('owner_id', d.owner_id); if (d.source_channel !== undefined) put('source_channel', d.source_channel || null); if (d.expected_close !== undefined) put('expected_close', d.expected_close)
  if (d.notes !== undefined) put('notes', d.notes || null); if (d.deal_type) put('deal_type', d.deal_type); if (d.customer_key !== undefined) put('customer_key', d.customer_key || null); if (d.customer_name !== undefined) put('customer_name', d.customer_name || null); if (d.lost_reason !== undefined) put('lost_reason', d.lost_reason || null)
  if (d.stage_key && d.stage_key !== cur.stage_key) {
    put('stage_key', d.stage_key); vals.push(closedKind(d.stage_key) !== 'open'); set.push('closed_at = CASE WHEN $' + vals.length + ' THEN now() END')
    await db().query('INSERT INTO growth.deal_moves (deal_id, from_stage, to_stage, by_user) VALUES ($1,$2,$3,$4)', [d.id, cur.stage_key, d.stage_key, user.userId])
  }
  if (set.length) await db().query('UPDATE growth.deals SET ' + set.join(', ') + ', updated_at = now() WHERE id = $1', vals)
  return { ok: true, id: d.id }
})
