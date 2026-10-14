// Dashboard: the latest meetings for the companies this person is assigned to (all, for people with full access),
// meetings they attended first, with open action items.
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'team', 'family', 'admin')
  if (!(await enabledModules()).has('meetings')) return { meetings: [], scoped: false }
  const vis = meetingScope(event, user.userId, 2)
  const rows = (await db().query(`SELECT m.id, m.title, m.kind, m.held_at, e.name AS entity, m.status, m.summary,
      (SELECT count(*)::int FROM jsonb_array_elements(m.actions) a WHERE NOT coalesce((a->>'done')::boolean, false)) AS open_actions,
      (SELECT count(*)::int FROM jsonb_array_elements(m.actions) a WHERE NOT coalesce((a->>'done')::boolean, false) AND a->>'owner_id' = $1) AS mine,
      ($1::uuid = ANY(m.attendees) OR m.created_by = $1::uuid) AS attended
    FROM core.meeting_minutes m LEFT JOIN core.entities e ON e.id = m.entity_id
    WHERE m.held_at > now() - interval '120 days' AND ` + vis.sql + ` ORDER BY ($1::uuid = ANY(m.attendees) OR m.created_by = $1::uuid) DESC, m.held_at DESC LIMIT 6`, [user.userId, ...vis.params])).rows
  return { meetings: rows, scoped: !!(event.context.entityScope as string | undefined) }
})
