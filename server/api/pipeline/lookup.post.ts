// Look a company up online for the pipeline (from its website or name). Nothing is saved: the form shows what was
// found, marked as AI, for someone to check.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team')
  const b = z.object({ query: z.string().trim().min(2).max(300), except: z.string().uuid().optional() }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Enter the company website or name.')
  await rateLimit('pipeline_lookup', (await currentOrg())!.id, 60, 60 * 60 * 1000)
  const q = b.data.query, isSite = /^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(q) && !/\s/.test(q)
  const r = await lookupCompany(isSite ? { website: q } : { name: q })
  const duplicate = await samePipelineDeal((r.profile.company as string) ?? (isSite ? null : q), (r.profile.website as string) ?? (isSite ? q : null), b.data.except)
  return { ...r, duplicate }
})
