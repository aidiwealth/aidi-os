// Draft a company document with AI from the form answers.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'team')
  rateLimit('docgen', user.userId, 25, 60 * 60 * 1000)
  const b = z.object({ type: z.string().max(40), answers: z.record(z.string(), z.string().max(4000)) }).safeParse(await readBody(event))
  if (!b.success || !DOC_TYPES[b.data.type]) throw apiError('invalid', 'Choose a document.')
  const t = DOC_TYPES[b.data.type]!
  const missing = t.fields.filter((f) => f.required && !b.data.answers[f.key]?.trim()).map((f) => f.label)
  if (missing.length) throw apiError('invalid', 'Please fill in: ' + missing.join(', ') + '.')
  const org = (await currentOrg())!, s = org.settings as Record<string, string>
  try { return await draftDocument(b.data.type, b.data.answers, { name: org.name, form: s.entity_type || 'other', state: s.state || '', country: s.country || '', ref: 'org:' + org.id }) }
  catch (err) { console.error('[docgen] failed', err); throw apiError('ai_failed', 'Could not draft the document just now. Try again in a moment.', 502) }
})
