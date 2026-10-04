// Time on a file: the viewer's page pings every 15 seconds while the file is open.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const b = z.object({ view_id: z.string().uuid() }).safeParse(await readBody(event))
  if (!b.success) return { ok: false }
  await asPlatform(() => db().query("UPDATE fundraise.views SET seconds = seconds + 15, last_seen = now() WHERE id = $1 AND last_seen < now() - interval '10 seconds' AND seconds < 7200", [b.data.view_id]))
  return { ok: true }
})
