// Every 15 minutes: record the health checks (kept 90 days).
import { timingSafeEqual } from 'node:crypto'
export default defineEventHandler(async (event) => {
  const secret = useRuntimeConfig().cronSecret, given = getRequestHeader(event, 'x-cron-secret') ?? ''
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) throw apiError('forbidden', 'Forbidden', 403)
  const r = await runChecks()
  await asPlatform(async () => { for (const c of r) await db().query('INSERT INTO core.status_checks (component, ok, latency_ms, note) VALUES ($1,$2,$3,$4)', [c.component, c.ok, c.latency_ms, c.note]); await db().query("DELETE FROM core.status_checks WHERE checked_at < now() - interval '90 days'") })
  return { ok: true }
})
