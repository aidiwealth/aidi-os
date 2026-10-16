// Write or improve one field of the investor page or the fundraising brief with AI. Billed to the workspace's AI allowance.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'admin', 'team')
  await rateLimit('ai_write', user.userId, 40, 60 * 60 * 1000)
  const b = z.object({ purpose: z.enum(['investor_page', 'raise']), field: z.string().max(40), current: z.string().max(60000).default(''), instruction: z.string().max(600).default(''),
    context: z.record(z.string(), z.union([z.string(), z.number(), z.null()]).transform((v) => (v == null ? '' : String(v)))).default({}) }).safeParse(await readBody(event))
  if (!b.success || !(b.data.field in AI_FIELDS[b.data.purpose])) throw apiError('invalid', 'Invalid request.')
  const org = (await currentOrg())!
  if (org.kind !== 'company') throw apiError('not_found', 'Not found', 404)
  let figures = ''
  try {
    const now = new Date(); const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0)).toISOString().slice(0, 10)
    const f = await periodFigures('month', end)
    if (f.current) figures = 'currency ' + f.currency + '; ' + Object.entries(f.current).filter(([, v]) => v !== null).map(([k, v]) => k.replace(/_/g, ' ') + ' ' + v).join(', ')
  } catch { /* no books yet */ }
  try {
    return { text: await aiWriteField({ ...b.data, company: org.name, figures, ref: 'ai-write:' + b.data.purpose + ':' + b.data.field }) }
  } catch (err) { if ((err as { statusCode?: number }).statusCode === 429) throw err; console.error('[ai-write] failed', err); throw apiError('ai_failed', 'Could not write this just now. Try again in a moment.', 502) }
})
