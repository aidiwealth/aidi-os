// Draft a company document with AI from the form answers.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'team')
  rateLimit('docgen', user.userId, 25, 60 * 60 * 1000)
  const b = z.object({ type: z.string().max(40), entity_id: z.string().uuid().optional(), answers: z.record(z.string(), z.string().max(4000)) }).safeParse(await readBody(event))
  if (!b.success || !DOC_TYPES[b.data.type]) throw apiError('invalid', 'Choose a document.')
  const t = DOC_TYPES[b.data.type]!
  const missing = t.fields.filter((f) => f.required && !b.data.answers[f.key]?.trim()).map((f) => f.label)
  if (missing.length) throw apiError('invalid', 'Please fill in: ' + missing.join(', ') + '.')
  const org = (await currentOrg())!, s = org.settings as Record<string, string>
  const ent = b.data.entity_id ? (await db().query<{ name: string; legal_name: string | null; jurisdiction: string | null; kind: string }>('SELECT name, legal_name, jurisdiction, kind FROM core.entities WHERE id = $1', [b.data.entity_id])).rows[0] : undefined
  const US: Record<string, string> = { DE: 'Delaware', CA: 'California', TX: 'Texas', NY: 'New York', WY: 'Wyoming', FL: 'Florida', AZ: 'Arizona', NV: 'Nevada' }
  const ctx = ent ? { name: ent.legal_name || ent.name, form: /llc/i.test(ent.name) ? 'us_llc' : /inc|corp/i.test(ent.name) ? 'us_corp' : /limited|ltd/i.test(ent.name) ? 'ng_ltd' : 'other', state: ent.jurisdiction?.startsWith('US-') ? US[ent.jurisdiction.slice(3)] ?? ent.jurisdiction.slice(3) : '', country: ent.jurisdiction?.startsWith('US') ? 'United States' : ent.jurisdiction === 'NG' ? 'Nigeria' : '', ref: 'entity:' + b.data.entity_id }
    : { name: org.name, form: s.entity_type || 'other', state: s.state || '', country: s.country || '', ref: 'org:' + org.id }
  try { return await draftDocument(b.data.type, b.data.answers, ctx) }
  catch (err) { if ((err as { statusCode?: number }).statusCode === 429) throw err; console.error('[docgen] failed', err); throw apiError('ai_failed', 'Could not draft the document just now. Try again in a moment.', 502) }
})
