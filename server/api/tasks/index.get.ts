// Tasks: mine (given to me, or to a group I am in), or everyone's that I may see. GPs and admins see all; team members
// never see tasks for GPs. Also the people tasks can go to.
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'team')
  const q = getQuery(event)
  const gp = isTaskGp(user.roles)
  const where: string[] = [TASK_SEE]; const args: unknown[] = [user.userId, gp]
  if (q.view !== 'all') where.push(`(t.assignee_id = $1 OR (t.assignee_group = 'team') OR (t.assignee_group = 'gp' AND $2::boolean))`)
  if (q.status === 'done') where.push("t.status = 'done'")
  else if (q.status !== 'all') where.push("(t.status <> 'done' OR t.completed_at > now() - interval '7 days')")
  if (typeof q.business === 'string' && TASK_BIZ[q.business]) { args.push(q.business); where.push('t.business = $' + args.length) }
  if (typeof q.person === 'string' && q.person) {
    if (q.person === 'gp' || q.person === 'team') { args.push(q.person); where.push('t.assignee_group = $' + args.length) }
    else if (/^[0-9a-f-]{36}$/.test(q.person)) { args.push(q.person); where.push('t.assignee_id = $' + args.length) }
  }
  const tasks = (await db().query<TaskRow>(`SELECT ${TASK_COLS} FROM core.tasks t ${TASK_JOINS} WHERE ${where.join(' AND ')}
    ORDER BY (t.status = 'done'), t.due_on NULLS LAST, CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, t.created_at LIMIT 500`, args)).rows
  const people = (await taskPeople()).filter((p) => gp || !p.gp || p.id === user.userId).map((p) => ({ id: p.id, name: p.name, gp: p.gp }))
  return { tasks, people, me: user.userId, gp, businesses: TASK_BIZ }
})
