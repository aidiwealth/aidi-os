// Find LPs with AI for a mandate (a fund raise, debt facility or co-investment). Runs in the background; the list
// comes back to pick from, ranked by fit.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  await rateLimit('lp_find', user.userId, 10, 60 * 60 * 1000)
  const s = (n: number) => z.string().trim().max(n).default('')
  const b = z.object({ pipeline_id: z.string().uuid().optional(), count: z.coerce.number().int().min(5).max(40).default(20),
    mandate: z.object({ fund: s(160), strategy: s(600), size_usd: z.coerce.number().min(0).max(1e12).nullable().default(null), ticket_usd: z.coerce.number().min(0).max(1e11).nullable().default(null), stages: s(200), sectors: s(300), regions: s(300),
      capital: z.enum(['equity', 'debt', 'both']).default('equity'), manager: s(400), kinds: z.array(z.string().max(40)).max(15).default([]), focus: s(400), vintage: s(20) }) }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Describe the fund: strategy, size, stages, sectors and regions.')
  const m = b.data.mandate
  if (!m.strategy && !m.sectors && !m.regions) throw apiError('invalid', 'Describe the strategy, sectors or regions so the AI knows which LPs fit.')
  const pid = b.data.pipeline_id
  if (pid) await db().query('UPDATE funds.lp_pipelines SET mandate = $2 WHERE id = $1', [pid, JSON.stringify(m)])
  const existing = (await db().query<{ name: string }>('SELECT name FROM funds.lp_prospects ORDER BY created_at DESC LIMIT 120')).rows.map((r) => r.name)
  const id = await startAiJob(event, 'lp_find', user.userId, async (set) => {
    await set('search', {})
    const r = await findLps(m, existing, b.data.count)
    await set('score', { total: r.rows.length })
    const text = pid ? (await pipelineMandate(pid)).text : mandateText(m)
    await scoreLps(r.rows, text, 'lp-find')
    r.rows.sort((a, c) => (c.likelihood ?? 0) - (a.likelihood ?? 0))
    const have = new Set(existing.map((x) => x.toLowerCase()))
    return { rows: r.rows.map((x) => ({ ...x, on_list: have.has(x.name.toLowerCase()) })), notes: (r.searched ? 'Found with a web search.' : 'From the AI\'s own knowledge (web search was not available): check websites and contacts; emails are left out.') + (r.notes ? ' ' + r.notes : ''), source: 'ai' }
  }, (err) => aiJobError(err, ['Try a narrower mandate (one region or sector).', 'Or import a list you already have.']))
  return { id }
})
