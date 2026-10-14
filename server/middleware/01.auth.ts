// Every /api route needs a signed-in user unless it is on this allow-list (public endpoints sit above the gate).
// The signed-in person's workspace becomes the database context for the whole request.
const PUBLIC = ['/api/ping', '/api/health', '/api/auth/request', '/api/auth/verify-otp', '/api/auth/magic', '/api/auth/logout', '/api/auth/return', '/api/auth/handoff']
export default defineEventHandler(async (event) => {
  event.context.orgId = null
  event.context.dbBypass = false
  const path = getRequestURL(event).pathname
  if (!path.startsWith('/api/') || PUBLIC.includes(path) || path === '/api/auth/mfa-verify' || path.startsWith('/api/public/') || path.startsWith('/api/v1/') || path === '/api/mcp') return
  const s = await readSession(event)
  if (!s) throw apiError('unauthorized', 'Sign in required', 401)
  if (s.roles.includes('services') && /^\/api\/(services|cs-analytics|documents|records)(\/|$)/.test(path)) s.roles = [...s.roles, 'team']
  event.context.user = s
  event.context.orgId = s.orgId
  event.context.entityScope = ''
  // Roles limited to an entity see only that company, or that company and its subsidiaries when the role says so
  // (admins and unscoped roles see everything).
  if (s.orgId && !s.roles.includes('admin')) {
    const sc = (await asPlatform(() => db().query<{ global: boolean; tree: string[] | null; only: string[] | null }>(
      `SELECT bool_or(scope_entity_id IS NULL) AS global, array_agg(DISTINCT scope_entity_id) FILTER (WHERE scope_entity_id IS NOT NULL AND include_subsidiaries) AS tree,
              array_agg(DISTINCT scope_entity_id) FILTER (WHERE scope_entity_id IS NOT NULL AND NOT include_subsidiaries) AS only FROM core.user_roles WHERE user_id = $1 AND organization_id = $2`, [s.userId, s.orgId]))).rows[0]
    if (sc && !sc.global && (sc.tree?.length || sc.only?.length)) {
      const all = sc.tree?.length ? (await asPlatform(() => db().query<{ id: string }>('WITH RECURSIVE t AS (SELECT id FROM core.entities WHERE id = ANY($1::uuid[]) UNION SELECT e.id FROM core.entities e JOIN t ON e.parent_id = t.id) SELECT id FROM t', [sc.tree]))).rows.map((r) => r.id) : []
      event.context.entityScope = [...new Set([...all, ...(sc.only ?? [])])].join(',') || '00000000-0000-0000-0000-000000000000'
    }
  }
})
