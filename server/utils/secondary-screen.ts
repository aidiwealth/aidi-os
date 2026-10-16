// AI screening of a secondary / SPV opportunity (Meridian, Wefunder or added by hand) against our stage and sector
// criteria and the investment thesis. Uses what the deal says and what the company's own website says; it advises,
// the team decides.
import { z } from 'zod'
import { secCriteria } from './secondaries'

export const SecScreen = z.object({
  score: z.number().int().min(0).max(100), recommendation: z.enum(['prioritise', 'review', 'likely_pass']),
  criteria_fit: z.number().int().min(1).max(5), company: z.number().int().min(1).max(5), terms: z.number().int().min(1).max(5), signal: z.number().int().min(1).max(5),
  summary: z.array(z.string().min(1).max(300)).min(1).max(3), strengths: z.array(z.string().min(1).max(300)).max(5), concerns: z.array(z.string().min(1).max(300)).max(5),
  questions: z.array(z.string().min(1).max(300)).max(5), flags: z.array(z.string().min(1).max(60)).max(5) })
export type SecScreenT = z.infer<typeof SecScreen>
const J = { type: 'object', additionalProperties: false, required: ['score', 'recommendation', 'criteria_fit', 'company', 'terms', 'signal', 'summary', 'strengths', 'concerns', 'questions', 'flags'], properties: {
  score: { type: 'integer', minimum: 0, maximum: 100 }, recommendation: { type: 'string', enum: ['prioritise', 'review', 'likely_pass'] },
  criteria_fit: { type: 'integer', minimum: 1, maximum: 5, description: 'Stage and sector against our criteria and thesis' }, company: { type: 'integer', minimum: 1, maximum: 5, description: 'Product, market and traction as far as known' },
  terms: { type: 'integer', minimum: 1, maximum: 5, description: 'Valuation / cap, minimum, structure, time left' }, signal: { type: 'integer', minimum: 1, maximum: 5, description: 'Quality of the lead and co-investors' },
  summary: { type: 'array', items: { type: 'string' }, maxItems: 3, description: 'Up to three short lines a partner reads in ten seconds' },
  strengths: { type: 'array', items: { type: 'string' }, maxItems: 5 }, concerns: { type: 'array', items: { type: 'string' }, maxItems: 5 },
  questions: { type: 'array', items: { type: 'string' }, maxItems: 5, description: 'What to ask the lead or check before investing' },
  flags: { type: 'array', items: { type: 'string' }, maxItems: 5, description: 'Short tags, e.g. "outside stage", "SPV fees unknown", "closes in 2 days"' } } }

export interface SecDealIn { title: string; company: string | null; website: string | null; sector: string | null; stage: string | null; lead: string | null; co_investors: string | null; min_investment: number | null; valuation: string | null; source: string; closes_at: string | null; notes: string | null; info: { description?: string; location?: string; founded?: string | number } | null }
export async function screenSecondary(d: SecDealIn, ref: string): Promise<SecScreenT> {
  const org = await currentOrg(), c = await secCriteria()
  const thesis = org?.settings.thesis?.trim() || ''
  const system = ['You screen secondary and SPV deal opportunities for ' + (org?.settings.investor_name || org?.name || 'an investment firm') + '.',
    'Criteria: stages ' + c.stages.join(', ') + '; focus sectors ' + c.sectors.join(', ') + '.', thesis ? 'Investment thesis:\n' + thesis : '',
    'Judge only what is given (the deal and the company\'s own website text). Do not invent traction, revenue or investors; if something is missing, say so in concerns and questions. Well-known lead investors may be noted as signal.',
    'Never treat race, ethnicity, nationality or gender as a negative factor.',
    'Scores 1 (weak) to 5 (strong); score 0-100 overall; recommendation "prioritise", "review" or "likely_pass". This is advice; the team decides.'].filter(Boolean).join('\n\n')
  const strip = (s: string | null) => (s ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 2500)
  const days = d.closes_at ? Math.round((new Date(d.closes_at + 'T00:00:00Z').getTime() - Date.now()) / 86400e3) : null
  const user = [['Opportunity', d.title], ['Company', d.company], ['Website', d.website], ['Sector', d.sector], ['Stage', d.stage], ['Lead investor', d.lead], ['Co-investors', d.co_investors],
    ['Minimum investment (USD)', d.min_investment], ['Valuation or cap', d.valuation], ['Platform', d.source === 'other' ? 'added by the team' : d.source], ['Closes', d.closes_at ? d.closes_at + (days !== null ? ' (' + days + ' days left)' : '') : null],
    ['What the company says about itself', d.info?.description], ['Location', d.info?.location], ['Founded', d.info?.founded], ['Team notes', strip(d.notes)]]
    .filter(([, v]) => v !== null && v !== undefined && v !== '').map(([k, v]) => k + ': ' + v).join('\n')
  const { output } = await runAiTool({ task: 'secondary_screen', model: useRuntimeConfig().aiModelPitchScreen, promptVersion: 'secondary-screen-v1', inputRef: ref, system, user,
    toolName: 'screen_deal', toolDescription: 'Record the screening of this opportunity.', jsonSchema: J, schema: SecScreen, maxTokens: 1500 })
  return output
}
