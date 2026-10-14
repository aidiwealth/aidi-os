// Meeting minutes the person can see (only their entities when their access is limited), with filters.
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'team', 'family', 'admin')
  const vis = meetingScope(event, user.userId, 2)
  const q = getQuery(event)
  const entity = /^[0-9a-f-]{36}$/.test(String(q.entity ?? '')) ? String(q.entity) : ''
  const rows = (await db().query(`SELECT m.id, m.title, m.kind, m.held_at, m.entity_id, e.name AS entity, m.status, m.summary, m.attendees, m.guests, m.updated_at,
      (SELECT count(*)::int FROM jsonb_array_elements(m.actions) a WHERE NOT coalesce((a->>'done')::boolean, false)) AS open_actions, jsonb_array_length(m.actions) AS actions,
      coalesce(p.full_name, u.email) AS by_name
    FROM core.meeting_minutes m LEFT JOIN core.entities e ON e.id = m.entity_id LEFT JOIN core.users u ON u.id = m.created_by LEFT JOIN core.people p ON p.id = u.person_id
    WHERE ($1 = '' OR m.entity_id::text = $1) AND ` + vis.sql + ` ORDER BY m.held_at DESC LIMIT 500`, [entity, ...vis.params])).rows
  const entities = (await db().query("SELECT id, name FROM core.entities WHERE status <> 'closed' ORDER BY name")).rows
  return { meetings: rows, entities, people: await orgPeople(), kinds: MEETING_KINDS, scoped: scopeOf(event).length > 0 }
})
