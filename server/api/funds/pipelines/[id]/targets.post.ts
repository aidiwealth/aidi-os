// LPs in a pipeline: add prospects (first stage), edit one (stage, amount, likelihood, next step, notes), move
// several to a stage, or remove.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp')
  const pid = String(getRouterParam(event, 'id') ?? '')
  const s = (n: number) => z.string().trim().max(n).nullable().optional()
  const b = z.object({ add: z.array(z.string().uuid()).max(500).optional(), move: z.object({ ids: z.array(z.string().uuid()).min(1).max(500), stage_id: z.string().uuid() }).optional(), remove: z.array(z.string().uuid()).max(500).optional(),
    edit: z.object({ id: z.string().uuid(), stage_id: z.string().uuid().optional(), amount: z.coerce.number().min(0).max(1e13).nullable().optional(), likelihood: z.coerce.number().int().min(0).max(100).nullable().optional(), next_step: s(300),
      next_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional().or(z.literal('').transform(() => null)), notes: s(3000) }).optional() }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Check the figures.')
  if (!/^[0-9a-f-]{36}$/.test(pid) || !(await db().query('SELECT 1 FROM funds.lp_pipelines WHERE id = $1', [pid])).rowCount) throw apiError('not_found', 'Pipeline not found.', 404)
  const stageOk = async (sid: string) => { if (!(await db().query('SELECT 1 FROM funds.lp_stages WHERE id = $1 AND pipeline_id = $2', [sid, pid])).rowCount) throw apiError('invalid', 'That stage is not in this pipeline.') }
  let n = 0
  if (b.data.add?.length) {
    const first = (await db().query<{ id: string }>('SELECT id FROM funds.lp_stages WHERE pipeline_id = $1 ORDER BY sort LIMIT 1', [pid])).rows[0]!
    for (const x of b.data.add) n += (await db().query('INSERT INTO funds.lp_targets (pipeline_id, stage_id, prospect_id) SELECT $1, $2, id FROM funds.lp_prospects WHERE id = $3 ON CONFLICT (pipeline_id, prospect_id) DO NOTHING', [pid, first.id, x])).rowCount ?? 0
  }
  if (b.data.move) { await stageOk(b.data.move.stage_id); n += (await db().query('UPDATE funds.lp_targets SET stage_id = $2, updated_at = now() WHERE pipeline_id = $1 AND id = ANY($3::uuid[])', [pid, b.data.move.stage_id, b.data.move.ids])).rowCount ?? 0 }
  if (b.data.remove?.length) n += (await db().query('DELETE FROM funds.lp_targets WHERE pipeline_id = $1 AND id = ANY($2::uuid[])', [pid, b.data.remove])).rowCount ?? 0
  if (b.data.edit) {
    const e = b.data.edit
    if (e.stage_id) await stageOk(e.stage_id)
    const cols: string[] = [], vals: unknown[] = [pid, e.id]
    for (const k of ['stage_id', 'amount', 'likelihood', 'next_step', 'next_date', 'notes'] as const) if (e[k] !== undefined) { vals.push(e[k] === '' ? null : e[k]); cols.push(k + ' = $' + vals.length) }
    if (cols.length) n += (await db().query('UPDATE funds.lp_targets SET ' + cols.join(', ') + ', updated_at = now() WHERE pipeline_id = $1 AND id = $2', vals)).rowCount ?? 0
  }
  return { ok: true, changed: n }
})
