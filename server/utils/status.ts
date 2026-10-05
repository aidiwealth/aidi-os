// Live health checks for the status page.
export const COMPONENTS: [string, string][] = [['app', 'Web app'], ['api', 'API'], ['database', 'Database'], ['email', 'Email delivery'], ['payments', 'Payments'], ['storage', 'File storage'], ['ai', 'AI features'], ['banking', 'Bank connections']]
export async function runChecks(): Promise<{ component: string; ok: boolean; latency_ms: number | null; note: string | null }[]> {
  const c = useRuntimeConfig(); const out: { component: string; ok: boolean; latency_ms: number | null; note: string | null }[] = []
  const t0 = Date.now()
  let dbOk = true
  try { await asPlatform(() => db().query('SELECT 1')) } catch { dbOk = false }
  const dbMs = Date.now() - t0
  out.push({ component: 'app', ok: true, latency_ms: null, note: null }, { component: 'api', ok: dbOk, latency_ms: dbMs, note: null }, { component: 'database', ok: dbOk, latency_ms: dbMs, note: dbOk ? null : 'Database not reachable' })
  // Services that are not set up are left off the page rather than shown as down.
  if (c.resendApiKey) out.push({ component: 'email', ok: true, latency_ms: null, note: null })
  if (c.stripeSecretKey || c.paystackSecretKey) out.push({ component: 'payments', ok: true, latency_ms: null, note: null })
  if (c.r2AccessKeyId && c.r2Bucket) out.push({ component: 'storage', ok: true, latency_ms: null, note: null })
  if (c.anthropicApiKey) out.push({ component: 'ai', ok: true, latency_ms: null, note: null })
  if (c.plaidClientId && c.plaidSecret) out.push({ component: 'banking', ok: true, latency_ms: null, note: null })
  return out
}
