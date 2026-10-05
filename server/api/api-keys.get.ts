export default defineEventHandler(async (event): Promise<Record<string, unknown>> => {
  await requireRole(event, 'admin', 'gp')
  const org = (await currentOrg())!
  return { company: org.kind === 'company', enabled: org.kind === 'company' || org.settings.api_enabled === 'true' || org.settings.api_enabled === true, keys: (await db().query('SELECT id, name, prefix, scopes, created_at, last_used_at, revoked_at FROM core.api_keys ORDER BY revoked_at NULLS FIRST, created_at DESC')).rows }
})
