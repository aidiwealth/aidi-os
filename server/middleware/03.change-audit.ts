// Every change made through admin, platform, settings, team, keys and account routes is written to the audit log
// (who, what route, from where), whatever the route itself records.
const WATCH = /^\/api\/(platform|admin|settings|team|api-keys|account|modules|billing|entities)(\/|$)/
export default defineEventHandler(async (event) => {
  const m = event.method
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(m)) return
  const path = event.path.split('?')[0]!
  const u = event.context.user as { userId?: string; support?: { by: string; id: string } | null } | undefined
  // Every change made during support access is recorded in the customer's own trail, naming the staff member.
  if (u?.support && u.userId) { try { await audit({ event, actorUserId: u.userId, action: 'support.change', objectType: 'route', detail: { path, method: m, by: u.support.by, support_access: u.support.id } }) } catch { /* never block the request on logging */ } }
  if (/^\/api\/(team|platform|settings|account)(\/|$)/.test(path)) forgetSessions()
  if (!WATCH.test(path) || !u?.userId) return
  try { await audit({ event, actorUserId: u.userId, action: 'change.' + m.toLowerCase(), objectType: 'route', detail: { path } }) } catch { /* never block the request on logging */ }
})
