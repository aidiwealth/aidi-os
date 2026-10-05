export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin', 'gp')
  return (await db().query('SELECT id, name, prefix, scopes, created_at, last_used_at, revoked_at FROM core.api_keys ORDER BY revoked_at NULLS FIRST, created_at DESC')).rows
})
