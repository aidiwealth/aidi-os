// The Service Level Agreement for the order being placed, to read before signing in the order wizard.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const u = await requirePortal(event)
  const b = z.object({ codes: z.array(z.string().regex(/^[a-z][a-z0-9_]{1,40}$/)).max(15).default([]), company: z.string().trim().max(200).default(''), company_id: z.string().uuid().optional(), notes: z.string().max(2000).default(''), vo_term: z.enum(['monthly', 'annual']).default('monthly'), name: z.string().trim().max(200).default('') }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Invalid request.')
  let company = b.data.company
  if (!company && b.data.company_id) company = (await db().query<{ name: string }>('SELECT name FROM services.companies WHERE id = $1 AND client_id = $2', [b.data.company_id, u.clientId])).rows[0]?.name ?? ''
  const t = await slaText({ clientId: u.clientId, codes: b.data.codes, company: company || null, notes: b.data.notes, voTerm: b.data.vo_term, signer: { name: b.data.name || u.name, email: u.email } })
  return { title: t.title, md: t.md, version: t.version, signer: { name: u.name, email: u.email } }
})
