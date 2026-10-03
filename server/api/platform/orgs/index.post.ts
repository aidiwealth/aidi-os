// Create a customer workspace and invite its first admin (they sign in at the Finvry address).
import { z } from 'zod'
const Body = z.object({
  name: z.string().trim().min(1).max(200),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{1,40}$/),
  kind: z.enum(ORG_KINDS),
  plan_code: z.string().min(1),
  status: z.enum(['trial', 'active']),
  trial_days: z.coerce.number().int().min(1).max(90).default(14),
  admin_name: z.string().trim().min(1).max(200),
  admin_email: z.string().trim().email().max(254)
})
export default defineEventHandler(async (event) => {
  const staff = await requirePlatform(event, true)
  const b = Body.safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Add the company, a link name (lower-case letters, numbers and dashes), type, plan and the first admin.')
  const r = await createWorkspace(event, staff.userId, b.data)
  return { ok: true, ...r }
})
