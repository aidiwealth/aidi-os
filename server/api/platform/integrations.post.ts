// Switch Mono (Nigerian bank connections) on or off. While off, Nigerian companies and subsidiaries are not offered
// "Connect a bank". Owner only.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const staff = await requirePlatform(event, true)
  if (staff.staffRole !== 'owner') throw apiError('forbidden', 'Only the platform owner can change integrations.', 403)
  const b = z.object({ mono: z.boolean() }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Choose on or off.')
  await asPlatform(() => db().query("INSERT INTO platform.settings (key, value, updated_by, updated_at) VALUES ('integrations', $1, $2, now()) ON CONFLICT (key) DO UPDATE SET value = platform.settings.value || EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()", [JSON.stringify(b.data), staff.userId]))
  await platformAudit(event, staff.userId, 'integrations', null, b.data)
  return { ok: true }
})
