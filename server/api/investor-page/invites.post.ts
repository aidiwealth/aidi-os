// Who may see the invite-only parts of the investor page: which parts are invite-only, add people (emails or
// "@domain"), approve or decline requests, take people off the list (their access ends at once).
import { z } from 'zod'
const Email = z.string().trim().toLowerCase().max(254).regex(/^([^\s@]+@[^\s@]+\.[^\s@]+|@[^\s@]+\.[^\s@]+)$/)
const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('parts'), invite_only: z.array(z.enum(['room', 'captable'])).max(2) }),
  z.object({ action: z.literal('add'), emails: z.array(z.string()).min(1).max(200), send: z.boolean().default(true) }),
  z.object({ action: z.enum(['approve', 'decline', 'remove', 'resend']), id: z.string().uuid() })])
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'admin')
  const b = Body.safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Invalid request.')
  const d = b.data, org = (await currentOrg())!
  const page = (await db().query<{ slug: string; published: boolean }>('SELECT slug, published FROM financials.public_pages LIMIT 1')).rows[0]
  if (!page) throw apiError('invalid', 'Save your investor page first.')
  const link = (org.kind === 'company' ? brands().finvry.url : brands().aidi.url) + '/' + page.slug
  const invite = async (email: string) => { if (!email.startsWith('@') && page.published) await sendPageInvite(email, org.name, link).catch((e) => console.error('[invites] email failed', e)) }
  if (d.action === 'parts') {
    await db().query('UPDATE financials.public_pages SET invite_only = $1', [[...new Set(d.invite_only)]])
    memoClear(org.id)
  } else if (d.action === 'add') {
    const list = [...new Set(d.emails.flatMap((x) => x.split(/[\s,;]+/)).map((x) => x.trim().toLowerCase().replace(/^\*@/, '@')).filter(Boolean))]
    const bad = list.filter((x) => !Email.safeParse(x).success)
    if (bad.length) throw apiError('invalid', 'Check these: ' + bad.slice(0, 5).join(', ') + '. Use an email, or @domain.com for everyone at a firm.')
    for (const e of list) {
      const r = await db().query(`INSERT INTO financials.page_invites (email, status, invited_by, invited_at) VALUES ($1, 'invited', $2, now())
        ON CONFLICT (organization_id, email) DO UPDATE SET status = 'invited', invited_by = $2, invited_at = now() WHERE financials.page_invites.status <> 'invited' RETURNING id`, [e, user.userId])
      if (r.rowCount && d.send) await invite(e)
    }
  } else {
    const row = (await db().query<{ email: string; status: string }>('SELECT email, status FROM financials.page_invites WHERE id = $1', [d.id])).rows[0]
    if (!row) throw apiError('not_found', 'Not found.', 404)
    if (d.action === 'approve') { await db().query("UPDATE financials.page_invites SET status = 'invited', invited_by = $2, invited_at = now() WHERE id = $1", [d.id, user.userId]); await invite(row.email) }
    else if (d.action === 'resend') { if (row.status === 'invited') await invite(row.email) }
    else if (d.action === 'decline') await db().query("UPDATE financials.page_invites SET status = 'declined' WHERE id = $1", [d.id])
    else await db().query('DELETE FROM financials.page_invites WHERE id = $1', [d.id])
  }
  await audit({ event, actorUserId: user.userId, action: 'investor_page.invites.' + d.action, objectType: 'organization', objectId: org.id, detail: d.action === 'add' ? { count: d.emails.length } : d.action === 'parts' ? { invite_only: d.invite_only } : { id: d.id } })
  return { ok: true }
})
