// Investor report sign-off and footer for this workspace: closing line, signer's name, title and photo, footer text.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'admin', 'team')
  const org = (await currentOrg())!
  const cur = ((org.settings as Record<string, unknown>).update_signoff ?? {}) as Record<string, unknown>
  if (getMethod(event) === 'GET') return { enabled: cur.enabled !== false, closing: cur.closing ?? 'Best,', name: cur.name ?? '', title: cur.title ?? '', photo_id: cur.photo_id ?? null, footer: cur.footer ?? '' }
  await requireRole(event, 'gp', 'admin')
  const b = z.object({ enabled: z.boolean(), closing: z.string().trim().max(120), name: z.string().trim().max(120), title: z.string().trim().max(160), photo_id: z.string().uuid().nullable(), footer: z.string().trim().max(400) }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Check the sign-off fields.')
  await asPlatform(() => db().query("UPDATE core.organizations SET settings = settings || jsonb_build_object('update_signoff', $2::jsonb) WHERE id = $1", [org.id, JSON.stringify(b.data)]))
  return { ok: true }
})
