// Someone not on the list asks to see the invite-only parts. The company is emailed and approves or declines on its
// investor page settings. Asking again is not an error; someone already on the list is told to use their email.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  await rateLimit('pinv_req_ip', clientIp(event), 6, 60 * 60 * 1000)
  const b = z.object({ website_hp: z.string().max(0).optional(), email: z.string().trim().toLowerCase().max(254).regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/), name: z.string().trim().min(1).max(120), company: z.string().trim().max(200).default(''), note: z.string().trim().max(1000).default('') }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Add your name and a valid email address.')
  const d = b.data, p = await pageBySlug(event)
  if (d.website_hp) throw apiError('invalid', 'Please try again.')
  if (await onInviteList(p.organization_id, d.email)) return { ok: true, invited: true }
  const ins = await asPlatform(() => db().query<{ id: string }>(`INSERT INTO financials.page_invites (organization_id, email, status, name, company, note, requested_at) VALUES ($1,$2,'requested',$3,$4,$5, now())
    ON CONFLICT (organization_id, email) DO UPDATE SET name = EXCLUDED.name, company = EXCLUDED.company, note = EXCLUDED.note, requested_at = now(), status = CASE WHEN financials.page_invites.status = 'declined' THEN 'declined' ELSE 'requested' END
    WHERE financials.page_invites.requested_at IS NULL OR financials.page_invites.requested_at < now() - interval '1 day' RETURNING id, status`, [p.organization_id, d.email, d.name, d.company || null, d.note || null]))
  const row = ins.rows[0] as { id: string; status: string } | undefined
  if (row?.status === 'requested') {
    setOrgContext(p.organization_id)
    const link = ((await currentOrg())?.kind === 'company' ? brands().finvry.url : brands().aidi.url) + '/investor-page#access'
    for (const to of await orgNotifyEmails()) sendPageAccessRequest(to, { email: d.email, name: d.name, company: d.company || null, note: d.note || null }, link).catch(() => {})
  }
  return { ok: true }
})
