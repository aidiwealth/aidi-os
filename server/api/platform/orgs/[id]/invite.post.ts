// Give a person admin access to a customer workspace and (optionally) send an invitation email you have edited.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const staff = await requirePlatform(event, true)
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  const b = z.object({ full_name: z.string().trim().min(1).max(200), email: z.string().trim().toLowerCase().email().max(254), subject: z.string().trim().min(1).max(200), message: z.string().trim().min(1).max(5000), send: z.boolean().default(true) }).safeParse(await readBody(event))
  if (!id.success || !b.success) throw apiError('invalid', 'Add a name, a valid email, a subject and a message.')
  const d = b.data
  const org = (await asPlatform(() => db().query<{ id: string; name: string; kind: string }>('SELECT id, name, kind FROM core.organizations WHERE id = $1', [id.data]))).rows[0]
  if (!org) throw apiError('not_found', 'Not found', 404)
  const userId = await asPlatform(async () => {
    const ex = (await db().query<{ id: string }>('SELECT id FROM core.users WHERE email = $1', [d.email])).rows[0]
    let uid = ex?.id
    if (!uid) {
      const p = await one<{ id: string }>("INSERT INTO core.people (full_name, email, kind) VALUES ($1, $2, 'other') ON CONFLICT (email) WHERE email IS NOT NULL DO UPDATE SET full_name = EXCLUDED.full_name RETURNING id", [d.full_name, d.email])
      uid = (await one<{ id: string }>('INSERT INTO core.users (person_id, email) VALUES ($1, $2) RETURNING id', [p.id, d.email])).id
    }
    if (!(await db().query('SELECT 1 FROM core.memberships WHERE user_id = $1 AND organization_id = $2', [uid, org.id])).rowCount) await db().query('INSERT INTO core.memberships (organization_id, user_id, invited_by) VALUES ($1, $2, $3)', [org.id, uid, staff.userId])
    for (const role of ['admin', 'gp']) if (!(await db().query('SELECT 1 FROM core.user_roles WHERE user_id = $1 AND organization_id = $2 AND role_code = $3', [uid, org.id, role])).rowCount) await db().query('INSERT INTO core.user_roles (organization_id, user_id, role_code, granted_by) VALUES ($1, $2, $3, $4)', [org.id, uid, role, staff.userId])
    await db().query("UPDATE core.organizations SET settings = settings || jsonb_build_object('owner_invited_at', now()::text) WHERE id = $1", [org.id])
    return uid
  })
  let emailed = false
  if (d.send) {
    const html = '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#0c1a2e;max-width:560px">' + d.message.split(/\n{2,}/).map((p) => '<p style="margin:0 0 14px">' + p.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>').replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#1c4f9c">$1</a>') + '</p>').join('') + '</div>'
    try { await sendEmail({ to: d.email, subject: d.subject, text: d.message, html, fromName: org.kind === 'company' ? 'Finvry' : 'Aidi' }); emailed = true } catch (err) { console.error('[invite] email failed', err) }
  }
  await audit({ event, actorUserId: staff.userId, action: 'platform.owner_invite', objectType: 'organization', objectId: org.id, detail: { email: d.email, emailed } })
  return { ok: true, user_id: userId, emailed }
})
