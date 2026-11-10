// A visitor gives their email to open an investor page that asks for it. Kept with their visits for the company.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const slug = String(getRouterParam(event, 'slug') ?? '').toLowerCase()
  if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(slug)) throw apiError('not_found', 'This page does not exist.', 404)
  await rateLimit('page_access', clientIp(event), 20, 60 * 60 * 1000)
  const b = z.object({ email: z.string().trim().toLowerCase().max(254).regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/), name: z.string().trim().max(120).optional() }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Enter a valid email address.')
  const p = (await asPlatform(() => db().query<{ organization_id: string; published: boolean; email_gate: boolean }>('SELECT organization_id, published, email_gate FROM financials.public_pages WHERE slug = $1', [slug]))).rows[0]
  if (!p?.published) throw apiError('not_found', 'This page does not exist.', 404)
  const row = (await asPlatform(() => db().query<{ id: string }>(`INSERT INTO financials.page_access (organization_id, email, name) VALUES ($1,$2,$3)
    ON CONFLICT (organization_id, email) DO UPDATE SET views = financials.page_access.views + 1, last_viewed_at = now(), name = coalesce(EXCLUDED.name, financials.page_access.name) RETURNING id`, [p.organization_id, b.data.email, b.data.name || null]))).rows[0]!
  setCookie(event, pageAccessCookie(p.organization_id), row.id, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365 })
  return { ok: true }
})
