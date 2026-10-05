// AI deal memo from the company's numbers, investor page, round and the founder's notes. Facts only from what is given.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  rateLimit('memo_ai', user.userId, 15, 60 * 60 * 1000)
  const b = z.object({ notes: z.record(z.string(), z.string().max(3000)).default({}) }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Invalid request.')
  const org = (await currentOrg())!
  const ent = await companyEntityId()
  const rows = ent ? (await loadStatements('entity:' + ent, 'month', (org.settings.currency as string) || 'USD')).slice(-12).map((r) => ({ period: r.period_end, ...derive(r.lines, 'month') })) : []
  const page = (await db().query<{ headline: string | null; about: string | null }>('SELECT headline, about FROM financials.public_pages LIMIT 1')).rows[0]
  const round = (await db().query("SELECT name, instrument, currency, target::float, valuation_cap::float, discount::float FROM fundraise.rounds ORDER BY (status = 'open') DESC, created_at DESC LIMIT 1")).rows[0]
  const figures = rows.map((r) => r.period + ': ' + ['revenue', 'gross_margin', 'net_income', 'cash', 'burn'].map((k) => k + ' ' + ((r as Record<string, unknown>)[k] ?? '-')).join(', ')).join('\n')
  const { z: zz } = await import('zod')
  try {
    const { output } = await runAiTool({ task: 'deal_memo', model: useRuntimeConfig().aiModelPitchScreen, promptVersion: 'deal-memo-v1', inputRef: 'org:' + org.id,
      system: 'You write a concise investment memo that a startup founder shares with prospective investors, in the style of a VC partner memo. Use only the facts and figures given; do not invent customers, numbers, market sizes or names. Where information is missing, write a short "[add: …]" placeholder instead. ' +
        'Structure in simple Markdown (## headings, short paragraphs, - bullets, **bold** for key numbers): Summary; The problem; The solution; Traction (with figures and growth); Market; Business model; Competition and why we win; Team; The round (instrument, amount, terms, use of funds); Risks and how we address them. Under 900 words, plain English.',
      user: 'Company: ' + org.name + (page?.headline ? '\nOne line: ' + page.headline : '') + (page?.about ? '\nAbout: ' + page.about : '') + '\nCurrency: ' + ((org.settings.currency as string) || 'USD') +
        '\nMonthly figures (oldest first):\n' + (figures || 'none recorded') + '\nRound: ' + (round ? JSON.stringify(round) : 'not set') + '\nFounder notes: ' + JSON.stringify(b.data.notes),
      toolName: 'write_memo', toolDescription: 'Return the memo.', jsonSchema: { type: 'object', additionalProperties: false, required: ['body'], properties: { body: { type: 'string' } } }, schema: zz.object({ body: zz.string().max(40000) }), maxTokens: 2500 })
    return output
  } catch (err) { if ((err as { statusCode?: number }).statusCode === 429) throw err; console.error('[memo] failed', err); throw apiError('ai_failed', 'Could not draft the memo just now. Try again, or write it yourself.', 502) }
})
