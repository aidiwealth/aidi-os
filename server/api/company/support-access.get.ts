// Settings → Support access: every time Finvry support opened this account with "Log in as": who, as whom, why,
// view only or with changes (and which changes), and when it ended. Workspace admins only.
export default defineEventHandler(async (event) => {
  await requireRole(event)
  const visits = (await db().query<{ id: string; reason: string; can_edit: boolean; started_at: string; expires_at: string; ended_at: string | null; by_name: string; as_email: string }>(
    `SELECT i.id, i.reason, i.can_edit, i.started_at, i.expires_at, i.ended_at, coalesce(sp.full_name, 'Finvry support') AS by_name, tu.email AS as_email
       FROM core.impersonations i JOIN core.users su ON su.id = i.staff_user_id LEFT JOIN core.people sp ON sp.id = su.person_id JOIN core.users tu ON tu.id = i.target_user_id
      ORDER BY i.started_at DESC LIMIT 100`)).rows
  const changes = visits.length ? (await db().query<{ sid: string; path: string; method: string; at: string }>(
    "SELECT detail->>'support_access' AS sid, detail->>'path' AS path, detail->>'method' AS method, at FROM core.audit_log WHERE action = 'support.change' AND detail->>'support_access' = ANY($1::text[]) ORDER BY at", [visits.map((v) => v.id)])).rows : []
  return { visits: visits.map((v) => ({ ...v, changes: changes.filter((c) => c.sid === v.id).map((c) => ({ at: c.at, what: (c.method === 'DELETE' ? 'Deleted' : c.method === 'POST' ? 'Saved' : 'Updated') + ' in ' + c.path.replace(/^\/api\//, '').split('/').filter((x) => !/^[0-9a-f-]{20,}$/i.test(x)).join(' › ').replace(/-/g, ' ') })) })) }
})
