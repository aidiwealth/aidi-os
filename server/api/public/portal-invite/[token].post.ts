// Accept an invite: confirm details, then sign straight in. The link works once.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  rateLimit('portal_invite', clientIp(event), 10, 15 * 60 * 1000)
  const token = String(getRouterParam(event, 'token') ?? '')
  const b = z.object({ name: z.string().trim().min(1).max(200), phone: z.string().trim().max(40).optional(), address: z.string().trim().max(500).optional() }).safeParse(await readBody(event))
  if (token.length < 30 || !b.success) throw apiError('invalid', 'Add your name.')
  const r = await asPlatform(() => db().query<{ id: string; organization_id: string }>(
    "UPDATE services.people SET name = $2, phone = coalesce(nullif($3, ''), phone), address = coalesce(nullif($4, ''), address), invite_token_hash = NULL, invite_expires = NULL, portal_access = true WHERE invite_token_hash = $1 AND invite_expires > now() RETURNING id, organization_id",
    [sha256(token), b.data.name, b.data.phone ?? '', b.data.address ?? '']))
  const p = r.rows[0]
  if (!p) throw apiError('invalid_link', 'This invite is no longer valid. Sign in with your email instead.', 404)
  await startPortalSession(event, p.id, p.organization_id)
  return { ok: true }
})
