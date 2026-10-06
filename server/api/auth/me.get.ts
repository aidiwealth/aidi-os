// The signed-in person, their roles in the current workspace, and every workspace they can switch to.
export default defineEventHandler(async (event) => {
  const s = await requireUser(event)
  const orgs = (await asPlatform(() => db().query<{ id: string; name: string; slug: string; kind: string; plan_code: string; status: string }>(
    `SELECT o.id, o.name, o.slug, o.kind, o.plan_code, o.status FROM core.memberships m JOIN core.organizations o ON o.id = m.organization_id
      WHERE m.user_id = $1 AND m.status = 'active' AND o.status = ANY($2::text[]) ORDER BY o.name`, [s.userId, LIVE_ORG_STATUSES]))).rows
  const imp = (await asPlatform(() => db().query<{ by: string | null }>('SELECT (SELECT email FROM core.users WHERE id = s.impersonated_by) AS by FROM core.sessions s WHERE s.id = $1', [s.sessionId]))).rows[0]?.by ?? null
  return { entity_scoped: !!(event.context.entityScope as string | undefined), support_by: imp, email: s.email, roles: s.roles, platform: s.platform, org: orgs.find((o) => o.id === s.orgId) ?? null, orgs }
})
