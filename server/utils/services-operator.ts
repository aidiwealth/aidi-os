// Aidi delivers services from its own workspace (the operator). Each services client can be linked to a Finvry company
// workspace whose users then see that client's requests, documents, invoices and messages inside Finvry.
import type { H3Event } from 'h3'
let opCache: { id: string; at: number } | null = null
export async function operatorOrgId(): Promise<string> {
  if (opCache && Date.now() - opCache.at < 300_000) return opCache.id
  const r = await asPlatform(() => db().query<{ id: string }>("SELECT id FROM core.organizations WHERE settings->>'services_operator' = 'true' ORDER BY created_at LIMIT 1"))
  if (!r.rows[0]) throw apiError('unavailable', 'Services are not available.', 503)
  opCache = { id: r.rows[0].id, at: Date.now() }
  return opCache.id
}

// The services client for a company workspace, created on first use so any Finvry company can order services.
export async function clientForWorkspace(orgId: string): Promise<{ id: string; name: string }> {
  const found = await asPlatform(() => db().query<{ id: string; name: string }>('SELECT id, name FROM services.clients WHERE workspace_id = $1', [orgId]))
  if (found.rows[0]) return found.rows[0]
  const op = await operatorOrgId()
  return asPlatform(async () => {
    const o = (await db().query<{ name: string; settings: Record<string, string> }>('SELECT name, settings FROM core.organizations WHERE id = $1', [orgId])).rows[0]!
    const admin = (await db().query<{ email: string; name: string | null }>(
      `SELECT u.email, p.full_name AS name FROM core.memberships m JOIN core.users u ON u.id = m.user_id LEFT JOIN core.people p ON p.id = u.person_id
        JOIN core.user_roles r ON r.user_id = m.user_id AND r.organization_id = m.organization_id AND r.role_code = 'admin' WHERE m.organization_id = $1 ORDER BY m.created_at LIMIT 1`, [orgId])).rows[0]
    const r = await db().query<{ id: string; name: string }>("INSERT INTO services.clients (organization_id, name, kind, contact_name, email, country, workspace_id) VALUES ($1,$2,'company',$3,$4,$5,$6) RETURNING id, name",
      [op, o.name, admin?.name ?? o.name, admin?.email ?? 'unknown@finvry.com', o.settings.country ?? null, orgId])
    return r.rows[0]!
  })
}

// Add someone to a workspace (as admin or team member), creating their user if needed. Returns true if newly added.
export async function addWorkspaceUser(orgId: string, email: string, name: string, role: 'admin' | 'team'): Promise<boolean> {
  return asPlatform(async () => {
    const e = email.toLowerCase()
    let uid = (await db().query<{ id: string }>('SELECT id FROM core.users WHERE email = $1', [e])).rows[0]?.id
    if (!uid) {
      const p = await db().query<{ id: string }>("INSERT INTO core.people (full_name, email, kind) VALUES ($1,$2,'team') ON CONFLICT (email) WHERE email IS NOT NULL DO UPDATE SET full_name = coalesce(core.people.full_name, EXCLUDED.full_name) RETURNING id", [name, e])
      uid = (await db().query<{ id: string }>('INSERT INTO core.users (person_id, email) VALUES ($1,$2) RETURNING id', [p.rows[0]!.id, e])).rows[0]!.id
    }
    const m = await db().query('INSERT INTO core.memberships (organization_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [orgId, uid])
    await db().query('INSERT INTO core.user_roles (organization_id, user_id, role_code) SELECT $1,$2,$3 WHERE NOT EXISTS (SELECT 1 FROM core.user_roles WHERE organization_id = $1 AND user_id = $2 AND role_code = $3)', [orgId, uid, role])
    return (m.rowCount ?? 0) > 0
  })
}

// Make sure a services client has a Finvry company workspace (free plan). Restores the caller's workspace context.
export async function workspaceForClient(event: H3Event, clientId: string): Promise<{ orgId: string; created: boolean }> {
  const prev = currentOrgId()
  const c = (await asPlatform(() => db().query<{ name: string; contact_name: string; email: string; country: string | null; workspace_id: string | null }>('SELECT name, contact_name, email, country, workspace_id FROM services.clients WHERE id = $1', [clientId]))).rows[0]
  if (!c) throw apiError('not_found', 'Client not found', 404)
  if (c.workspace_id) return { orgId: c.workspace_id, created: false }
  const base = c.name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'company'
  const nigeria = /nigeria/i.test(c.country ?? '')
  try {
    const ws = await createWorkspace(event, null, { name: c.name, slug: (base.length < 2 ? base + '-co' : base) + '-' + Math.random().toString(36).slice(2, 6), kind: 'company', plan_code: 'company_free', status: 'active', trial_days: 0, admin_name: c.contact_name, admin_email: c.email },
      { invite: false, settings: { country: c.country ?? '', currency: nigeria ? 'NGN' : 'USD', public_name: c.name } })
    await asPlatform(() => db().query('UPDATE services.clients SET workspace_id = $2 WHERE id = $1', [clientId, ws.id]))
    return { orgId: ws.id, created: true }
  } finally { setOrgContext(prev) }
}
