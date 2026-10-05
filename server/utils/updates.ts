// Investor updates: the figures for a period (from Financials) and the AI first draft.
export async function periodFigures(periodType: string, periodEnd: string, subject?: string | null): Promise<{ currency: string; current: Record<string, number | null> | null; previous: Record<string, number | null> | null; months: number }> {
  const org = (await currentOrg())!
  const subj = await updateSubject(subject)
  if (!subj) return { currency: 'USD', current: null, previous: null, months: 0 }
  const rows = await loadStatements(subj, 'month', (org.settings.currency as string) || 'USD')
  const upto = rows.filter((r) => r.period_end <= periodEnd)
  const n = periodType === 'quarter' ? 3 : 1
  const sum = (set: typeof rows) => {
    if (!set.length) return null
    const flows = ['revenue', 'cogs', 'opex_payroll', 'opex_marketing', 'opex_rnd', 'opex_ga', 'opex_other', 'opex_total', 'net_income', 'operating_cf']
    const lines: Record<string, number | null> = {}
    for (const k of flows) { const v = set.map((r) => r.lines[k]).filter((x): x is number => typeof x === 'number'); lines[k] = v.length ? v.reduce((a, b) => a + b, 0) : null }
    const lastRow = set[set.length - 1]!
    for (const k of ['cash', 'total_assets', 'total_liabilities', 'equity']) lines[k] = (lastRow.lines[k] as number | undefined) ?? null
    return derive(lines, periodType === 'quarter' ? 'quarter' : 'month')
  }
  return { currency: rows[0]?.currency ?? ((org.settings.currency as string) || 'USD'), current: sum(upto.slice(-n)), previous: sum(upto.slice(-2 * n, -n)), months: upto.length }
}

const SCHEMA = { type: 'object', additionalProperties: false, required: ['title', 'body'], properties: {
  title: { type: 'string', description: 'Short title, e.g. "Zuri Labs: September 2026 update"' },
  body: { type: 'string', description: 'The update in simple Markdown: ## headings, short paragraphs, - bullets, **bold** for key numbers. No tables, no HTML.' } } }
export async function draftUpdate(input: { lp?: boolean; company: string; periodLabel: string; currency: string; current: Record<string, number | null> | null; previous: Record<string, number | null> | null; highlights: string; challenges: string; asks: string; ref: string }) {
  const { z } = await import('zod')
  const fmt = (o: Record<string, number | null> | null) => o ? Object.entries(o).filter(([, v]) => v !== null).map(([k, v]) => k + ': ' + v).join(', ') : 'none recorded'
  const { output } = await runAiTool({ task: 'investor_update', model: useRuntimeConfig().aiModelPitchScreen, promptVersion: 'investor-update-v1', inputRef: input.ref,
    system: (input.lp ? 'You write concise, honest LP and partner reports for a venture fund\'s general partner, in the style of a well-run fund\'s quarterly letter: fund performance, portfolio highlights, new investments and exits, pipeline and outlook. ' : 'You write concise, honest investor updates for startup founders, in the style of a well-run company\'s monthly or quarterly letter. ') +
      'Use only the figures given; never invent numbers, customers or events. Compare with the previous period where figures exist (give % change). Amounts are in the stated currency; write them with the currency symbol and thousands separators. ' +
      (input.lp ? 'Structure: a two-sentence summary, ## Fund and financial figures (bullets), ## Portfolio highlights, ## Challenges and risks, ## Requests of LPs (from the asks), ## Outlook. Leave out a section if there is nothing for it. Professional, plain English, under 550 words.' : 'Structure: a two-sentence summary, ## Key metrics (bullets), ## Highlights, ## Challenges, ## How you can help (from the asks), ## Next period. Leave out a section if there is nothing for it. Warm, plain English, under 450 words.'),
    user: 'Company: ' + input.company + '\nPeriod: ' + input.periodLabel + '\nCurrency: ' + input.currency + '\nThis period: ' + fmt(input.current) + '\nPrevious period: ' + fmt(input.previous) +
      '\nFounder highlights: ' + (input.highlights || 'none') + '\nChallenges: ' + (input.challenges || 'none') + '\nAsks: ' + (input.asks || 'none'),
    toolName: 'write_update', toolDescription: 'Return the investor update.', jsonSchema: SCHEMA, schema: z.object({ title: z.string().max(200), body: z.string().max(30000) }), maxTokens: 1800 })
  return output
}
export const updateLabel = (type: string, end: string) => { const d = new Date(end + 'T00:00:00Z'); return type === 'quarter' ? 'Q' + (Math.floor(d.getUTCMonth() / 3) + 1) + ' ' + d.getUTCFullYear() : d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }) }

// What a reader sees: the update, the period's key figures, and the company.
export async function publicUpdate(id: string, publishedOnly: boolean) {
  const u = (await db().query<{ title: string; body: string | null; period_type: string; period_end: string; status: string; published_at: string | null; blocks: Block[]; cover_id: string | null; from_name: string | null; subject: string | null }>("SELECT title, body, blocks, cover_id, from_name, subject, period_type, to_char(period_end, 'YYYY-MM-DD') AS period_end, status, published_at FROM financials.updates WHERE id = $1", [id])).rows[0]
  if (!u || (publishedOnly && u.status !== 'published')) throw apiError('not_found', 'Not found', 404)
  const page = (await db().query<{ slug: string; published: boolean }>('SELECT slug, published FROM financials.public_pages LIMIT 1')).rows[0]
  const html = u.blocks?.length ? await renderUpdateDoc(u, { company: (await currentOrg())!.name, base: brands().finvry.url, email: false }) : ''
  return { html, title: u.title, body: u.body ?? '', label: updateLabel(u.period_type, u.period_end), figures: await periodFigures(u.period_type, u.period_end), company: (await currentOrg())!.name, page: page?.published ? page.slug : null, workspace: await publicWorkspace() }
}
