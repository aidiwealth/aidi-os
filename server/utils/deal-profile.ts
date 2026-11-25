// A company in the pipeline: the details people (or AI, from the web) fill in. One list of fields shared by the add
// form, the deal page and the AI lookup, so they never drift apart.
import { z } from 'zod'
const t = (n: number) => z.string().trim().max(n).nullable().optional().transform((v) => (v ? v : null))
const url = (n: number) => t(n).transform((v) => (v && !/^https?:\/\//i.test(v) ? 'https://' + v : v))
export const Founder = z.object({ name: z.string().trim().min(1).max(120), role: z.string().trim().max(80).default(''), linkedin: z.string().trim().max(500).default('') })
export const ProfileFields = {
  one_liner: t(300), website: url(500), description: t(10000), sector: t(100), country: t(100), city: t(100),
  founded: z.coerce.number().int().min(1900).max(2100).nullable().optional().or(z.literal('').transform(() => null)),
  business_model: t(60), team_size: t(40), linkedin: url(500), founders: z.array(Founder).max(12).optional(),
  lead_investor: t(200), investors: t(1000), traction: t(5000), deck_url: url(1000), referred_by: t(200)
}
// What AI may fill (and mark as unchecked); money and round are numbers/choices handled alongside.
export const AI_KEYS = ['company', 'website', 'one_liner', 'description', 'sector', 'country', 'city', 'founded', 'business_model', 'team_size', 'linkedin', 'founders', 'round', 'raise_usd', 'valuation_usd', 'lead_investor', 'investors', 'traction'] as const
export const Sources = z.array(z.object({ title: z.string().trim().max(300).default(''), url: z.string().trim().max(1000).regex(/^https?:\/\//) })).max(30)
export const MODELS = ['B2B', 'B2C', 'B2B2C', 'Marketplace', 'Infrastructure / API', 'Hardware', 'Other']
const S = { type: 'string' } as const
export const PROFILE_TOOL = { name: 'record_company', description: 'Record what you found about the company. Leave out anything you could not confirm.', input_schema: { type: 'object', properties: {
  company: { ...S, description: 'The company\'s usual name' }, website: { ...S, description: 'Main website URL' }, one_liner: { ...S, description: 'What it does, one plain sentence, under 25 words' },
  description: { ...S, description: '2-3 plain sentences: product, customers, how it makes money' }, sector: { ...S, description: 'e.g. Fintech, Health, Logistics, Climate' },
  business_model: { type: 'string', enum: MODELS }, country: { ...S, description: 'Headquarters country' }, city: { ...S, description: 'Headquarters city' },
  founded: { type: 'integer', description: 'Year founded' }, team_size: { ...S, description: 'Headcount range, e.g. 11-50' }, linkedin: { ...S, description: 'Company LinkedIn page URL' },
  founders: { type: 'array', items: { type: 'object', properties: { name: S, role: S, linkedin: S }, required: ['name'] } },
  round: { type: 'string', enum: ['pre_seed', 'seed', 'series_a', 'series_b', 'later'], description: 'The round it is raising now, or the latest round if nothing is known about a current raise' },
  raise_usd: { type: 'integer', description: 'Amount of that round in US dollars' }, valuation_usd: { type: 'integer', description: 'Post-money valuation in US dollars, only if reported' },
  lead_investor: { ...S, description: 'Lead investor of that round' }, investors: { ...S, description: 'Other known investors, comma separated' },
  traction: { ...S, description: 'Reported revenue, users, growth or key customers, each with where and when it was reported' },
  sources: { type: 'array', items: { type: 'object', properties: { title: S, url: S }, required: ['url'] }, description: 'The pages you actually used' } } } }

export interface Looked { profile: Record<string, unknown>; sources: { title: string; url: string }[] }
// Ask AI (with web search) about a company; returns only well-formed values.
export async function lookupCompany(q: { name?: string | null; website?: string | null }): Promise<Looked> {
  const who = [q.name && 'Company: ' + q.name, q.website && 'Website: ' + q.website].filter(Boolean).join('\n')
  const { output } = await aiWithWeb<Record<string, unknown>>({ task: 'pipeline_company_lookup', web: true, maxUses: 6, maxTokens: 2500, tool: PROFILE_TOOL,
    system: 'You research startups for a venture capital firm\'s deal pipeline. Search the company\'s own website, its LinkedIn, reputable tech and business press and funding announcements. Make sure every fact is about this company (watch for others with similar names). Money in US dollars (convert and say so in traction if reported in another currency). Never guess: leave a field out when the sources do not state it.',
    user: who + '\n\nFind what this company does, where it is based, its founders, its funding and traction. Then call record_company.' })
  const o = output ?? {}, p: Record<string, unknown> = {}
  const str = (k: string, n: number) => { const v = o[k]; if (typeof v === 'string' && v.trim()) p[k] = v.trim().slice(0, n) }
  str('company', 200); str('website', 500); str('one_liner', 300); str('description', 3000); str('sector', 100); str('country', 100); str('city', 100); str('team_size', 40); str('linkedin', 500); str('lead_investor', 200); str('investors', 1000); str('traction', 2000)
  if (typeof o.business_model === 'string' && MODELS.includes(o.business_model)) p.business_model = o.business_model
  if (typeof o.round === 'string' && ['pre_seed', 'seed', 'series_a', 'series_b', 'later'].includes(o.round)) p.round = o.round
  const year = Number(o.founded); if (Number.isInteger(year) && year >= 1900 && year <= new Date().getFullYear()) p.founded = String(year)
  for (const k of ['raise_usd', 'valuation_usd']) { const n = Number(o[k]); if (Number.isFinite(n) && n > 0 && n < 1e11) p[k] = String(Math.round(n)) }
  if (Array.isArray(o.founders)) { const f = o.founders.map((x) => Founder.safeParse({ name: x?.name, role: x?.role ?? '', linkedin: x?.linkedin ?? '' })).filter((r) => r.success).map((r) => r.data!).slice(0, 12); if (f.length) p.founders = f }
  for (const k of ['website', 'linkedin']) if (typeof p[k] === 'string' && !/^https?:\/\//.test(p[k] as string)) p[k] = 'https://' + p[k]
  const seen = new Set<string>(), sources: { title: string; url: string }[] = []
  for (const s of Array.isArray(o.sources) ? o.sources : []) { const u = String(s?.url ?? '').trim(); if (/^https?:\/\//.test(u) && !seen.has(u) && sources.length < 12) { seen.add(u); sources.push({ title: String(s?.title ?? '').trim().slice(0, 200), url: u.slice(0, 1000) }) } }
  return { profile: p, sources }
}

// Another deal in the pipeline for the same company (same name, or same website domain).
export async function samePipelineDeal(name: string | null | undefined, website: string | null | undefined, except?: string): Promise<{ id: string; company: string; stage: string } | null> {
  const host = (website ?? '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0] || null
  if (!name && !host) return null
  return (await db().query<{ id: string; company: string; stage: string }>(`SELECT id, company, stage FROM deals.deals WHERE ($3::uuid IS NULL OR id <> $3)
    AND ((lower(company) = lower($1)) OR ($2::text IS NOT NULL AND split_part(regexp_replace(lower(coalesce(website, '')), '^(https?://)?(www\\.)?', ''), '/', 1) = $2)) ORDER BY created_at DESC LIMIT 1`, [name ?? '', host, except ?? null])).rows[0] ?? null
}
