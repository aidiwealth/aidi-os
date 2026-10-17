// Add chosen investors and grants to a pipeline (an existing one, or a new one), at the first stage.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team')
  const b = z.object({ ids: z.array(z.string().uuid()).min(1).max(100), pipeline_id: z.string().uuid().optional(), new_pipeline: z.object({ name: z.string().trim().min(1).max(120), target: z.coerce.number().min(0).max(1e12).nullable().optional(), currency: z.enum(['USD', 'NGN']).default('USD') }).optional(),
    remember: z.object({ stage: z.string().max(20).optional(), sectors: z.array(z.string().max(30)).max(10).optional() }).optional() }).safeParse(await readBody(event))
  if (!b.success || (!b.data.pipeline_id && !b.data.new_pipeline)) throw apiError('invalid', 'Choose a pipeline, or name a new one.')
  let pid = b.data.pipeline_id ?? null
  if (pid && !(await db().query('SELECT 1 FROM crm.pipelines WHERE id = $1', [pid])).rowCount) throw apiError('not_found', 'Pipeline not found.', 404)
  if (!pid) pid = await createPipeline({ name: b.data.new_pipeline!.name, currency: b.data.new_pipeline!.currency, target: b.data.new_pipeline!.target ?? null })
  const stage = (await db().query<{ id: string }>('SELECT id FROM crm.stages WHERE pipeline_id = $1 ORDER BY sort LIMIT 1', [pid])).rows[0]?.id
  if (!stage) throw apiError('invalid', 'That pipeline has no stages yet. Add stages first.')
  const list = (await allProspects()).filter((p) => b.data.ids.includes(p.id))
  const have = new Set((await db().query<{ k: string }>('SELECT lower(investor) AS k FROM crm.deals WHERE pipeline_id = $1', [pid])).rows.map((r) => r.k))
  let added = 0
  for (const p of list) {
    if (have.has(p.name.toLowerCase())) continue
    const note = [(p.kind === 'grant' ? 'Grant · ' : '') + (PROSPECT_TYPE_LABEL[p.type] ?? ''), p.description, p.how_to_apply ? 'How to apply: ' + p.how_to_apply : '', p.website ?? ''].filter(Boolean).join('\n').slice(0, 3000)
    // Grants and lenders keep their kind, so they stay off the cap table and show their deadline.
    const inst = p.kind === 'grant' ? 'grant' : p.type === 'lender' ? 'debt' : null
    const dl = /^\d{4}-\d{2}-\d{2}$/.test(p.deadline ?? '') ? p.deadline : null
    await db().query('INSERT INTO crm.deals (pipeline_id, stage_id, investor, notes, instrument, deadline, meta) VALUES ($1,$2,$3,$4,$5,$6,$7)', [pid, stage, p.name.slice(0, 200), note, inst, dl, JSON.stringify(p.deadline && !dl ? { deadline: p.deadline.slice(0, 80) } : {})])
    added++
  }
  // Remember the stage and sectors the founder searched with, as the default next time.
  if (b.data.remember) { const org = (await currentOrg())!; await asPlatform(() => db().query("UPDATE core.organizations SET settings = settings || jsonb_build_object('raise_stage', $2::text, 'sectors', $3::jsonb) WHERE id = $1", [org.id, b.data.remember!.stage ?? '', JSON.stringify(b.data.remember!.sectors ?? [])])) }
  return { ok: true, added, skipped: list.length - added, pipeline_id: pid }
})
