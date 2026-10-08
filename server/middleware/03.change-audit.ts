// Every change made through admin, platform, settings, team, keys and account routes is written to the audit log
// (who, what route, from where), whatever the route itself records.
const WATCH = /^\/api\/(platform|admin|settings|team|api-keys|account|modules|billing|entities)(\/|$)/
export default defineEventHandler(async (event) => {
  const m = event.method
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(m)) return
  const path = event.path.split('?')[0]!
  const u = event.context.user as { userId?: string } | undefined
  if (!WATCH.test(path) || !u?.userId) return
  try { await audit({ event, actorUserId: u.userId, action: 'change.' + m.toLowerCase(), objectType: 'route', detail: { path } }) } catch { /* never block the request on logging */ }
})
