// Mark a page as seen (clears its sidebar count).
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const b = z.object({ area: z.enum(['client', 'fundraising', 'jobs']) }).safeParse(await readBody(event))
  const org = await currentOrg()
  if (!b.success || !org) return { ok: false }
  await asPlatform(() => db().query('INSERT INTO core.seen (user_id, organization_id, area) VALUES ($1,$2,$3) ON CONFLICT (user_id, organization_id, area) DO UPDATE SET seen_at = now()', [user.userId, org.id, b.data.area]))
  return { ok: true }
})
