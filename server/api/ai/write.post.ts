// Write or improve one field of the investor page or the fundraising brief with AI. Billed to the workspace's AI allowance.
import { z } from 'zod'
import { deriveLines } from '~/shared/fin-view'
import { factsOf } from '~/server/utils/fin-analysis'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'admin', 'team')
  await rateLimit('ai_write', user.userId, 40, 60 * 60 * 1000)
  const b = z.object({ web: z.boolean().default(false), purpose: z.enum(['investor_page', 'raise', 'report']), field: z.string().max(40), current: z.string().max(60000).default(''), instruction: z.string().max(600).default(''),
    context: z.record(z.string(), z.union([z.string(), z.number(), z.null()]).transform((v) => (v == null ? '' : String(v)))).default({}) }).safeParse(await readBody(event))
  if (!b.success || !(b.data.field in AI_FIELDS[b.data.purpose])) throw apiError('invalid', 'Invalid request.')
  const org = (await currentOrg())!
  if (org.kind !== 'company' && b.data.purpose !== 'report') throw apiError('not_found', 'Not found', 404)
  let figures = ''
  try {
    const now = new Date(); const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0)).toISOString().slice(0, 10)
    const f = await periodFigures('month', end)
    if (f.current) figures = 'currency ' + f.currency + '; ' + Object.entries(f.current).filter(([, v]) => v !== null).map(([k, v]) => k.replace(/_/g, ' ') + ' ' + v).join(', ')
  } catch { /* no books yet */ }
  // The report's own period: the facts for that company or group (revenue, margins, costs, cash, burn, growth).
  if (b.data.purpose === 'report') {
    const subj = String(b.data.context.subject ?? '')
    if (/^(group|(entity|company):[0-9a-f-]{36})$/.test(subj)) {
      try {
        const rows = await loadStatements(subj, 'month', await subjectCurrency(subj))
        const upto = String(b.data.context.period_end ?? '')
        const fr = rows.filter((r) => !upto || r.period_end <= upto).map((r) => ({ period_end: r.period_end, period_type: r.period_type, currency: r.currency, lines: r.lines, kpis: r.kpis ?? {}, derived: deriveLines(r.lines, 1) }))
        if (fr.length) { const { facts, period } = factsOf(fr as never); figures = 'for ' + (await subjectName(subj)) + ', ' + period + ': ' + Object.entries(facts).filter(([, v]) => v !== null && v !== '').map(([k, v]) => k.replace(/_/g, ' ') + ' ' + v).join(', ').slice(0, 4000) }
      } catch { /* keep the latest month */ }
    }
  }
  const account = await accountContext().catch(() => '')
  try {
    return { text: await aiWriteField({ ...b.data, company: org.name, figures, account, ref: 'ai-write:' + b.data.purpose + ':' + b.data.field }) }
  } catch (err) { if ((err as { statusCode?: number }).statusCode === 429) throw err; console.error('[ai-write] failed', err); throw apiError('ai_failed', 'Could not write this just now. Try again in a moment.', 502) }
})
