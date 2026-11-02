// Create a task (for me, a colleague, all GPs or the whole team). Team members can't give tasks to GPs.
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'team')
  const b = TASK_FIELDS.safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Give the task a title.')
  const [aid, grp] = await resolveAssignee(b.data.assignee, user)
  const r = (await db().query<{ id: string }>(`INSERT INTO core.tasks (title, notes, business, priority, due_on, assignee_id, assignee_group, link, checklist, repeat, created_by)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
    [b.data.title, b.data.notes || null, b.data.business ?? 'group', b.data.priority ?? 'normal', b.data.due_on || null, aid, grp, b.data.link || null, JSON.stringify(b.data.checklist ?? []), b.data.repeat ?? 'none', user.userId])).rows[0]!
  await taskEvent(r.id, user.userId, 'created')
  await tellAssignee(r.id, aid, user.userId)
  return { id: r.id }
})
