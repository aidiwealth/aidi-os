// Creating a customer workspace (from the console or by converting a won lead): an isolated workspace on the Finvry
// brand, a first fund or holding entity, and its first admin, who is invited by email.
import type { H3Event } from 'h3'
export interface NewWorkspace { name: string; slug: string; kind: string; plan_code: string; status: 'trial' | 'active'; trial_days: number; admin_name: string; admin_email: string }

export async function createWorkspace(event: H3Event, staffUserId: string | null, d: NewWorkspace, opts: { invite?: boolean; settings?: Record<string, string> } = {}): Promise<{ id: string; emailed: boolean }> {
  const email = d.admin_email.toLowerCase()
  const orgId = await asPlatform(async () => {
    if ((await db().query('SELECT 1 FROM core.organizations WHERE slug = $1', [d.slug])).rowCount) throw apiError('slug_taken', 'That link name is already used.', 409)
    if (!(await db().query('SELECT 1 FROM core.plans WHERE code = $1 AND active', [d.plan_code])).rowCount) throw apiError('invalid', 'Choose an active plan.')
    const client = await db().connect()
    try {
      await client.query('BEGIN')
      const o = await client.query<{ id: string }>(
        `INSERT INTO core.organizations (name, slug, kind, status, plan_code, trial_ends_at, settings, created_by)
         VALUES ($1,$2,$3,$4,$5, CASE WHEN $4 = 'trial' THEN now() + make_interval(days => $6) END, '{"brand":"finvry"}'::jsonb || $8::jsonb, $7) RETURNING id`,
        [d.name, d.slug, d.kind, d.status, d.plan_code, d.trial_days, staffUserId, JSON.stringify(opts.settings ?? {})])
      const id = o.rows[0]!.id
      const ent = await client.query<{ id: string }>("INSERT INTO core.entities (organization_id, name, kind, status) VALUES ($1, $2, $3, 'active') RETURNING id",
        [id, d.kind === 'family_office' ? d.name + ' Holdings' : d.kind === 'company' ? d.name : d.name + ' Fund I', d.kind === 'family_office' ? 'holding' : d.kind === 'company' ? 'operating' : 'fund'])
      await client.query("UPDATE core.organizations SET settings = settings || jsonb_build_object('default_vehicle_id', $2::text) WHERE id = $1", [id, ent.rows[0]!.id])
      const existing = await client.query<{ id: string }>('SELECT id FROM core.users WHERE email = $1', [email])
      let userId = existing.rows[0]?.id
      if (!userId) {
        const p = await client.query<{ id: string }>(
          `INSERT INTO core.people (full_name, email, kind) VALUES ($1, $2, 'team') ON CONFLICT (email) WHERE email IS NOT NULL DO UPDATE SET full_name = EXCLUDED.full_name RETURNING id`, [d.admin_name, email])
        userId = (await client.query<{ id: string }>('INSERT INTO core.users (person_id, email) VALUES ($1, $2) RETURNING id', [p.rows[0]!.id, email])).rows[0]!.id
      }
      await client.query('INSERT INTO core.memberships (organization_id, user_id, invited_by) VALUES ($1,$2,$3)', [id, userId, staffUserId])
      await client.query("INSERT INTO core.user_roles (organization_id, user_id, role_code, granted_by) VALUES ($1,$2,'admin',$3)", [id, userId, staffUserId])
      await client.query('COMMIT')
      return id
    } catch (err) { await client.query('ROLLBACK'); throw err } finally { client.release() }
  })
  await platformAudit(event, staffUserId, staffUserId ? 'workspace_create' : 'workspace_signup', orgId, { name: d.name, plan: d.plan_code, status: d.status, admin: email })
  setOrgContext(orgId)
  let emailed = false
  if (opts.invite !== false) { try { await sendInviteEmail(email, d.admin_name, 'the Finvry team'); emailed = true } catch (err) { console.error('[platform] invite failed for ' + email, err) } }
  setOrgContext(null)
  return { id: orgId, emailed }
}
