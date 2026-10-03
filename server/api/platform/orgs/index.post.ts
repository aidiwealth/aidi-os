// Create a customer workspace and invite its first admin (they sign in at the Finvry address).
import { z } from 'zod'
const Body = z.object({
  name: z.string().trim().min(1).max(200),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{1,40}$/),
  kind: z.enum(ORG_KINDS),
  plan_code: z.string().min(1),
  status: z.enum(['trial', 'active']),
  trial_days: z.coerce.number().int().min(1).max(90).default(14),
  admin_name: z.string().trim().min(1).max(200),
  admin_email: z.string().trim().email().max(254)
})
export default defineEventHandler(async (event) => {
  const staff = await requirePlatform(event, true)
  const b = Body.safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Add the company, a link name (lower-case letters, numbers and dashes), type, plan and the first admin.')
  const d = b.data, email = d.admin_email.toLowerCase()
  const orgId = await asPlatform(async () => {
    if ((await db().query('SELECT 1 FROM core.organizations WHERE slug = $1', [d.slug])).rowCount) throw apiError('slug_taken', 'That link name is already used.', 409)
    if (!(await db().query('SELECT 1 FROM core.plans WHERE code = $1 AND active', [d.plan_code])).rowCount) throw apiError('invalid', 'Choose an active plan.')
    const client = await db().connect()
    try {
      await client.query('BEGIN')
      const o = await client.query<{ id: string }>(
        `INSERT INTO core.organizations (name, slug, kind, status, plan_code, trial_ends_at, settings, created_by)
         VALUES ($1,$2,$3,$4,$5, CASE WHEN $4 = 'trial' THEN now() + make_interval(days => $6) END, '{"brand":"finvry"}'::jsonb, $7) RETURNING id`,
        [d.name, d.slug, d.kind, d.status, d.plan_code, d.trial_days, staff.userId])
      const id = o.rows[0]!.id
      // A first entity so deals and companies have a default vehicle or holder
      const ent = await client.query<{ id: string }>("INSERT INTO core.entities (organization_id, name, kind, status) VALUES ($1, $2, $3, 'active') RETURNING id",
        [id, d.kind === 'family_office' ? d.name + ' Holdings' : d.name + ' Fund I', d.kind === 'family_office' ? 'holding' : 'fund'])
      await client.query("UPDATE core.organizations SET settings = settings || jsonb_build_object('default_vehicle_id', $2::text) WHERE id = $1", [id, ent.rows[0]!.id])
      const existing = await client.query<{ id: string }>('SELECT id FROM core.users WHERE email = $1', [email])
      let userId = existing.rows[0]?.id
      if (!userId) {
        const p = await client.query<{ id: string }>(
          `INSERT INTO core.people (full_name, email, kind) VALUES ($1, $2, 'team') ON CONFLICT (email) WHERE email IS NOT NULL DO UPDATE SET full_name = EXCLUDED.full_name RETURNING id`, [d.admin_name, email])
        userId = (await client.query<{ id: string }>('INSERT INTO core.users (person_id, email) VALUES ($1, $2) RETURNING id', [p.rows[0]!.id, email])).rows[0]!.id
      }
      await client.query('INSERT INTO core.memberships (organization_id, user_id, invited_by) VALUES ($1,$2,$3)', [id, userId, staff.userId])
      await client.query("INSERT INTO core.user_roles (organization_id, user_id, role_code, granted_by) VALUES ($1,$2,'admin',$3)", [id, userId, staff.userId])
      await client.query('COMMIT')
      return id
    } catch (err) { await client.query('ROLLBACK'); throw err } finally { client.release() }
  })
  await platformAudit(event, staff.userId, 'workspace_create', orgId, { name: d.name, plan: d.plan_code, status: d.status, admin: email })
  // The invitation carries the customer's brand (Finvry) and address
  setOrgContext(orgId)
  let emailed = false
  try { await sendInviteEmail(email, d.admin_name, 'the Finvry team'); emailed = true } catch (err) { console.error('[platform] invite failed for ' + email, err) }
  setOrgContext(null)
  return { ok: true, id: orgId, emailed }
})
