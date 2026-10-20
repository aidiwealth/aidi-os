// "Fill with AI" in Report details: suggestions for the details still empty, from the company's own account (entities,
// people, banks, documents, cap table, investor page) and, when asked, from the web (the company's site, registries,
// press). Nothing is saved here: the founder sees each suggestion with where it came from, checks it and saves.
import { z } from 'zod'
const KEYS = ['legal_form', 'jurisdiction', 'incorporated_on', 'principal_activities', 'registered_office', 'other_offices', 'directors', 'secretary', 'cfo', 'signatory', 'bankers', 'legal_counsel', 'registered_agent', 'tax_adviser'] as const
const TOOL = { name: 'record_details', description: 'Record the report details you could establish, each with where it came from.', input_schema: { type: 'object', required: ['fields'], properties: { fields: { type: 'array', items: { type: 'object', required: ['key', 'value', 'source'], properties: {
  key: { type: 'string', enum: [...KEYS] },
  value: { type: 'string', description: 'incorporated_on: YYYY-MM-DD. directors: one per line as "Name | Role". cfo, signatory: "Name | Role". bankers: one bank per line. legal_counsel, registered_agent, tax_adviser: "Firm | Address". Others: plain text.' },
  source: { type: 'string', description: 'Where it came from: "Your account: …" (which record) or the web page address' } } } } } } }
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'admin')
  await rateLimit('report_suggest', user.userId, 10, 60 * 60 * 1000)
  const b = z.object({ web: z.boolean().default(false), only: z.array(z.enum(KEYS)).optional() }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Invalid request.')
  const org = (await currentOrg())!
  const { profile: p } = await reportProfile()
  const pr = p as unknown as Record<string, unknown>
  const empty = (k: string) => { const v = pr[k]; if (Array.isArray(v)) return !v.some((x) => (typeof x === 'string' ? x.trim() : (x as { name?: string })?.name?.trim())); if (v && typeof v === 'object') return !String((v as { name?: string }).name ?? '').trim(); return !String(v ?? '').trim() }
  const want = (b.data.only ?? [...KEYS]).filter(empty)
  if (!want.length) return { fields: [], searched: false }
  const ctx = await accountContext()
  const { output, searched } = await aiWithWeb<{ fields: { key: string; value: string; source: string }[] }>({ task: 'report_details_suggest', web: b.data.web, maxUses: 6, tool: TOOL,
    system: 'You prepare the company details for a startup\'s annual financial report (directors and advisers page, report of the directors). Fill only what the facts support: first the company\'s own account data given to you, then, if you can search, its website, official registries (company registers, state filings), and reputable press. Prefer the account data where both exist. Principal activities: two or three plain sentences on what the company does, for whom and where. Officers: only people the facts name in that role. Give each field the source you used.',
    user: 'Company: ' + (p.legal_name || org.name) + '\nFill these empty details: ' + want.join(', ') + '\n\nThe company\'s account data:\n' + ctx })
  const ok = new Set<string>(want)
  const fields = (output.fields ?? []).filter((f) => ok.has(f.key) && typeof f.value === 'string' && f.value.trim()).map((f) => ({ key: f.key, value: f.value.trim().slice(0, 2000), source: String(f.source ?? '').trim().slice(0, 300) }))
    .filter((f) => f.key !== 'incorporated_on' || /^\d{4}-\d{2}-\d{2}$/.test(f.value))
  return { fields, searched }
})
