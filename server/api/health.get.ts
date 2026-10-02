// Readiness check: database reachable, core tables present, required settings set. 503 otherwise.
export default defineEventHandler(async (event) => {
  const cfg = useRuntimeConfig()
  const missing: string[] = []
  if (!cfg.databaseUrl) missing.push('NUXT_DATABASE_URL')
  if (process.env.NODE_ENV === 'production') {
    if (!cfg.jwtSecret || cfg.jwtSecret.length < 32) missing.push('NUXT_JWT_SECRET')
    if (!cfg.resendApiKey) missing.push('NUXT_RESEND_API_KEY')
    if (!cfg.anthropicApiKey) missing.push('NUXT_ANTHROPIC_API_KEY')
  }
  let database: 'ok' | 'error' = 'error'
  let detail: string | null = null
  if (cfg.databaseUrl) {
    try {
      const r = await db().query<{ n: number }>("SELECT count(*)::int AS n FROM core.roles")
      if ((r.rows[0]?.n ?? 0) < 1) detail = 'core.roles is empty: apply db/changes/001_core.sql'
      else database = 'ok'
    } catch (err) {
      detail = err instanceof Error ? err.message : String(err)
      console.error('[health] database check failed', err)
    }
  }
  const ok = missing.length === 0 && database === 'ok'
  if (!ok) setResponseStatus(event, 503)
  return { ok, database, missing, detail }
})
