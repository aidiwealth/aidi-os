// Sign-up mode and caps: invite-only, open or closed; new accounts a week; new service orders a month; demo booking link.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const staff = await requirePlatform(event, true)
  const b = z.object({ mode: z.enum(['invite_only', 'open', 'closed']), weekly_cap: z.coerce.number().int().min(0).max(10000), services_month_cap: z.coerce.number().int().min(0).max(10000),
    demo_url: z.string().trim().max(300).refine((u) => !u || /^https:\/\//.test(u), 'Use an https link').default('') }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Check the mode, the caps (0 means no cap) and the demo link (https).')
  const was = await accessSettings()
  await asPlatform(() => db().query("INSERT INTO platform.settings (key, value, updated_by, updated_at) VALUES ('access', $1, $2, now()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()", [JSON.stringify(b.data), staff.userId]))
  await platformAudit(event, staff.userId, 'access_settings', null, { from: was, to: b.data })
  if (was.mode !== b.data.mode) slack('critical.security', 'Finvry sign-up changed from ' + was.mode.replace('_', '-') + ' to ' + b.data.mode.replace('_', '-'), [['By', staff.email]])
  return { ok: true }
})
