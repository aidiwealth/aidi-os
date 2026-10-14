// Time spent on a shared forecast or cap table: the page pings every 15 seconds while it is open.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const b = z.object({ view_id: z.string().uuid() }).safeParse(await readBody(event))
  if (!b.success) return { ok: false }
  await asPlatform(() => db().query("UPDATE financials.share_views SET seconds = seconds + 15, last_at = now() WHERE id = $1 AND last_at < now() - interval '10 seconds' AND seconds < 14400", [b.data.view_id]))
  return { ok: true }
})
