// AI writing help for founders: drafts or improves one field of the investor page or the fundraising brief, from what
// the founder has already written and the company's own figures. Never invents numbers; gaps become [brackets].
export const AI_FIELDS = {
  investor_page: {
    headline: { kind: 'line', what: 'the one-line headline at the top of the company\'s public investor page: what the company does and for whom, under 110 characters, no full stop' },
    about: { kind: 'md', what: 'the "About the company" section of the public investor page: what the company does, the problem, who it serves, traction, business model and team. 120 to 220 words, short paragraphs and a few bullets' },
  },
  raise: {
    use_of_funds: { kind: 'md', what: 'the "Use of funds" section of a fundraising brief: where the money goes (as % or amounts of the round), the milestones it buys, and the runway in months. Bullets with a one-line intro, under 170 words' },
    traction: { kind: 'md', what: 'the "Traction" section of a fundraising brief: revenue, growth rate, users or customers, retention, notable customers and partners. Lead with the strongest number. Bullets, under 170 words' },
    target_investors: { kind: 'md', what: 'the "Investors you would like us to approach" section of a fundraising brief: the kinds of investors that fit (stage, sector, cheque size, geography), plus any named funds or angels the founder already mentioned. Bullets, under 140 words' },
  },
  // The investor financial report (annual report or statements): the founder's own words, written with AI from the
  // figures for the period, the account's data and, when asked, what is published online about the company.
  report: {
    review: { kind: 'md', what: 'the "Review of the business" in the report of the directors of an annual financial report: what the company does, what happened in the period (revenue, margins, costs, cash, key events), what drove the numbers and what comes next. Formal, factual, third person ("the Company"), 150 to 300 words, short paragraphs, no bullets' },
    note_income: { kind: 'md', what: 'a short management comment on the income statement for the period: revenue, gross margin, operating costs and the result, with the main reasons. Two to four sentences, factual, third person' },
    note_balance: { kind: 'md', what: 'a short management comment on the balance sheet at the period end: cash and investments, receivables, payables, debt or SAFEs, and equity, with what changed. Two to four sentences, factual, third person' },
    note_cash: { kind: 'md', what: 'a short management comment on the cash flow for the period: cash from operations, investing and financing, burn and runway. Two to four sentences, factual, third person' },
  },
} as const
export type AiPurpose = keyof typeof AI_FIELDS

export async function aiWriteField(input: { purpose: AiPurpose; field: string; company: string; current: string; instruction: string; context: Record<string, string>; figures: string; ref: string; account?: string; web?: boolean }): Promise<string> {
  const { z } = await import('zod')
  const spec = (AI_FIELDS[input.purpose] as Record<string, { kind: string; what: string }>)[input.field]
  if (!spec) throw apiError('invalid', 'Unknown field.')
  const ctx = Object.entries(input.context).filter(([, v]) => v && String(v).trim()).map(([k, v]) => '- ' + k.replace(/_/g, ' ') + ': ' + String(v).slice(0, 1500)).join('\n')
  const system = 'You help startup founders write clear, credible copy for investors. Write in plain, confident English, first person plural ("we"), no hype words (revolutionary, disruptive, game-changing), no emojis. ' +
      'Use only facts given to you: never invent numbers, customers, partners, investors or team members. Where a useful fact is missing, leave a short placeholder in square brackets, e.g. [monthly revenue], so the founder can fill it in. ' +
      (spec.kind === 'line' ? 'Return a single line of plain text, no Markdown.' : 'Return simple Markdown: short paragraphs, "- " bullets, **bold** for key numbers. No headings, tables or HTML.') + (input.purpose === 'report' ? ' This is for a formal financial report: write in the third person ("the Company"), never "we".' : '') + (input.web ? ' You may search the web for public facts about the company (its website, press, registries); use them only when they clearly concern this company, and never for figures that its books give.' : '')
  const user = 'Company: ' + input.company + '\nWrite: ' + spec.what + '.' +
      (input.current.trim() ? '\n\nThe founder\'s current text (improve and tighten it; keep every fact in it):\n' + input.current.slice(0, 4000) : '') +
      (input.instruction.trim() ? '\n\nFounder\'s instruction: ' + input.instruction.slice(0, 600) : '') +
      (ctx ? '\n\nOther things the founder has written:\n' + ctx : '') +
      (input.figures ? '\n\nLatest figures from the company\'s books: ' + input.figures : '') + (input.account ? '\n\nThe company\'s account data:\n' + input.account.slice(0, 8000) : '')
  if (input.web) {
    const r = await aiWithWeb<{ text: string }>({ task: 'ai_write_' + input.purpose, web: true, maxUses: 4, system, user, tool: { name: 'write_text', description: 'Return the written text.', input_schema: { type: 'object', required: ['text'], properties: { text: { type: 'string', description: 'The text, ready to paste in.' } } } }, maxTokens: 2500 })
    return String(r.output.text ?? '').trim().slice(0, 6000)
  }
  const { output } = await runAiTool({ task: 'ai_write_' + input.purpose, model: useRuntimeConfig().aiModelPitchScreen, promptVersion: 'ai-write-v1', inputRef: input.ref,
    system, user,
    toolName: 'write_text', toolDescription: 'Return the written text.', jsonSchema: { type: 'object', required: ['text'], properties: { text: { type: 'string', description: 'The text, ready to paste in.' } } },
    schema: z.object({ text: z.string().min(1).max(6000) }), maxTokens: 900 })
  return output.text.trim()
}
