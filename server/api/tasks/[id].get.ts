// One task with its history (notes, status changes, reassignments, ticks).
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'team')
  const task = await taskFor(getRouterParam(event, 'id') ?? '', user)
  const events = (await db().query(`SELECT e.id, e.kind, e.body, e.at, e.user_id, coalesce(p.full_name, u.email, 'Aidi') AS who FROM core.task_events e LEFT JOIN core.users u ON u.id = e.user_id LEFT JOIN core.people p ON p.id = u.person_id
    WHERE e.task_id = $1 ORDER BY e.at`, [task.id])).rows
  return { task, events }
})
