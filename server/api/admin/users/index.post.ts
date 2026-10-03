// Invite someone to this workspace with one role. People already on the platform (in another workspace) are simply added.
import { z } from 'zod'
const Body = z.object({
  full_name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(254),
  role: z.enum(ROLES),
  entity_id: z.string().uuid().optional().or(z.literal('').transform(() => undefined)),
  send_email: z.boolean().default(true)
})
export default defineEventHandler(async (event) => {
  const admin = await requireRole(event, 'admin')
  const b = Body.safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Add a name, a valid email and a role.')
  const email = b.data.email.toLowerCase()
  const existing = await db().query<{ id: string }>('SELECT id FROM core.users WHERE email = $1', [email])
  if (existing.rows[0]) {
    const member = await db().query('SELECT 1 FROM core.memberships WHERE user_id = $1', [existing.rows[0].id])
    if (member.rowCount) throw apiError('exists', 'That person already has access to this workspace. Change their roles in the list instead.', 409)
  }
  const client = await db().connect()
  let userId: string
  try {
    await client.query('BEGIN')
    if (existing.rows[0]) userId = existing.rows[0].id
    else {
      const p = await client.query<{ id: string }>(
        `INSERT INTO core.people (full_name, email, kind) VALUES ($1, $2, $3)
         ON CONFLICT (email) WHERE email IS NOT NULL DO UPDATE SET full_name = EXCLUDED.full_name RETURNING id`,
        [b.data.full_name, email, personKind(b.data.role)])
      const u = await client.query<{ id: string }>('INSERT INTO core.users (person_id, email) VALUES ($1, $2) RETURNING id', [p.rows[0]!.id, email])
      userId = u.rows[0]!.id
    }
    await client.query('INSERT INTO core.memberships (user_id, invited_by) VALUES ($1, $2)', [userId, admin.userId])
    await client.query('INSERT INTO core.user_roles (user_id, role_code, scope_entity_id, granted_by) VALUES ($1,$2,$3,$4)',
      [userId, b.data.role, b.data.entity_id ?? null, admin.userId])
    await client.query('INSERT INTO core.audit_log (actor_user_id, action, object_type, object_id, entity_id, detail, ip) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [admin.userId, 'user.invite', 'user', userId, b.data.entity_id ?? null, JSON.stringify({ email, role: b.data.role }), getRequestIP(event, { xForwardedFor: true }) ?? null])
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
  let emailed = false
  if (b.data.send_email) {
    try { await sendInviteEmail(email, b.data.full_name, admin.email); emailed = true }
    catch (err) { console.error('[team] invite email failed for ' + email, err) }
  }
  return { ok: true, id: userId, emailed }
})
