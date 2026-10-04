// Services for founders: members of a Finvry company workspace act for that company's services client.
import type { H3Event } from 'h3'
export interface PortalUser { sessionId: string; personId: string | null; userId?: string | null; clientId: string; orgId: string; name: string; email: string; client: string }

export async function requirePortal(event: H3Event): Promise<PortalUser> {
  const s = await readSession(event)
  if (!s?.orgId) throw apiError('signed_out', 'Please sign in.', 401)
  const o = (await asPlatform(() => db().query<{ kind: string }>('SELECT kind FROM core.organizations WHERE id = $1', [s.orgId]))).rows[0]
  if (o?.kind !== 'company') throw apiError('not_found', 'Services are available in Finvry company workspaces.', 404)
  const c = await clientForWorkspace(s.orgId)
  const who = (await asPlatform(() => db().query<{ name: string | null }>('SELECT p.full_name AS name FROM core.users u LEFT JOIN core.people p ON p.id = u.person_id WHERE u.id = $1', [s.userId]))).rows[0]
  const op = await operatorOrgId()
  setOrgContext(op)
  return { sessionId: s.sessionId, personId: null, userId: s.userId, clientId: c.id, orgId: op, name: who?.name ?? s.email, email: s.email, client: c.name }
}

// Where a client reads an update: their Finvry workspace.
export async function portalUrl(path = '', _clientId?: string): Promise<string> { return brands().finvry.url + '/client' + path }

// Who on a client should hear about something: their Finvry workspace's members; else the client's main email (with a job link).
export async function clientRecipients(clientId: string): Promise<{ emails: string[]; portal: boolean }> {
  const ws = await asPlatform(() => db().query<{ email: string }>(
    `SELECT DISTINCT u.email FROM services.clients c JOIN core.memberships m ON m.organization_id = c.workspace_id AND m.status = 'active' JOIN core.users u ON u.id = m.user_id AND u.status = 'active' WHERE c.id = $1`, [clientId]))
  if (ws.rows.length) return { emails: ws.rows.map((r) => r.email), portal: true }
  const c = await db().query<{ email: string }>('SELECT email FROM services.clients WHERE id = $1', [clientId])
  return { emails: c.rows.map((r) => r.email), portal: false }
}
