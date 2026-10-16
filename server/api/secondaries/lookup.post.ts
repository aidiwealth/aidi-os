// Look a company up from its website (or its name): name, description, logo, social links. With a deal id, the
// details are saved on the deal (the company name only fills an empty one).
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp', 'team')
  await rateLimit('company_lookup', user.userId, 120, 60 * 60 * 1000)
  const b = z.object({ id: z.string().uuid().optional(), name: z.string().trim().max(200).optional(), website: z.string().trim().max(300).optional() }).safeParse(await readBody(event))
  if (!b.success || (!b.data.name && !b.data.website)) throw apiError('invalid', 'Enter the company name or website.')
  const info = await companyInfo({ name: b.data.name, website: b.data.website })
  if (!info) return { found: false }
  if (b.data.id) await db().query("UPDATE wm.secondaries SET company = coalesce(nullif(company, ''), $2), website = $3, logo_doc_id = coalesce($4, logo_doc_id), company_info = $5, updated_at = now() WHERE id = $1", [b.data.id, info.name, info.website, info.logo_doc_id, JSON.stringify(info)])
  return { found: true, info }
})
