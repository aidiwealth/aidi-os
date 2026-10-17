// Save the LPs picked from an import or an AI search to the prospect list, and optionally add them to a pipeline
// (first stage, with how likely each is to commit).
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  const b = z.object({ rows: z.array(z.record(z.string(), z.unknown())).min(1).max(500), source: z.enum(['import', 'sheet', 'ai', 'manual']).default('import'), pipeline_id: z.string().uuid().optional() }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Pick the LPs to add.')
  const rows = b.data.rows.map((r) => { const x = cleanRow(r); if (x) { x.likelihood = Number.isFinite(Number(r.likelihood)) && r.likelihood !== null ? Math.max(0, Math.min(100, Math.round(Number(r.likelihood)))) : null; x.reason = String(r.reason ?? '').slice(0, 300) } return x }).filter((x): x is LpRow => !!x)
  if (!rows.length) throw apiError('invalid', 'Pick the LPs to add.')
  const { ids, added, updated } = await saveProspects(rows, b.data.source, user.userId)
  let inPipeline = 0
  if (b.data.pipeline_id) {
    const stages = (await db().query<{ id: string; name: string; kind: string; sort: number }>('SELECT id, name, kind, sort FROM funds.lp_stages WHERE pipeline_id = $1 ORDER BY sort', [b.data.pipeline_id])).rows
    if (!stages.length) throw apiError('not_found', 'Pipeline not found.', 404)
    // The list's own status picks the stage (not contacted → the first; contacted, meeting / DD, committed, passed).
    const stageFor = (status: string) => {
      const x = status.toLowerCase(), open = stages.filter((s) => s.kind === 'open')
      if (!x || /not contacted|^new|to contact|identified/.test(x)) return stages[0]!
      if (/pass|declin|no\b|lost|rejected/.test(x)) return stages.find((s) => s.kind === 'lost') ?? stages[0]!
      if (/closed|signed|funded|wired|disbursed/.test(x)) return stages.find((s) => s.kind === 'won') ?? stages[0]!
      if (/commit|soft circle|approved/.test(x)) return stages.find((s) => s.kind === 'committed') ?? stages[0]!
      if (/dd\b|diligence|data room|meeting|call booked|ic\b/.test(x)) return open[Math.min(2, open.length - 1)] ?? stages[0]!
      if (/contact|intro|emailed|reached/.test(x)) return open[Math.min(1, open.length - 1)] ?? stages[0]!
      return stages[0]!
    }
    for (const r of rows) {
      const next = /^\d{4}-\d{2}-\d{2}$/.test(r.extra?.next_followup ?? '') ? r.extra.next_followup : null
      const note = [r.extra?.warm_intro ? 'Warm intro: ' + r.extra.warm_intro : '', r.extra?.route ? 'Route: ' + r.extra.route : ''].filter(Boolean).join('\n') || null
      const x = await db().query('INSERT INTO funds.lp_targets (pipeline_id, stage_id, prospect_id, likelihood, likelihood_note, next_date, next_step, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (pipeline_id, prospect_id) DO NOTHING',
        [b.data.pipeline_id, stageFor(r.extra?.status ?? '').id, ids.get(r.name.toLowerCase()), r.likelihood, r.reason || null, next, next ? 'Follow up' : null, note])
      inPipeline += x.rowCount ?? 0
    }
  }
  await audit({ event, actorUserId: user.userId, action: 'funds.lp_prospects_added', objectType: 'lp_prospect', detail: { added, updated, inPipeline, source: b.data.source } })
  return { ok: true, added, updated, in_pipeline: inPipeline }
})
