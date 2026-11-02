import { z } from 'zod'
// Change a task: its details, status, checklist or who it is for; add a note; or delete it (GPs, or whoever created it).
const STATUS: Record<string, string> = { todo: 'To do', doing: 'Doing', waiting: 'Waiting', done: 'Done' }
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'family', 'team')
  const t = await taskFor(getRouterParam(event, 'id') ?? '', user)
  const body = await readBody(event) as Record<string, unknown>
  if (body.action === 'note') {
    const n = z.string().trim().min(1).max(2000).safeParse(body.body); if (!n.success) throw apiError('invalid', 'Write a note.')
    await taskEvent(t.id, user.userId, 'note', n.data); return { ok: true }
  }
  if (body.action === 'delete') {
    if (!isTaskGp(user.roles) && t.created_by !== user.userId) throw apiError('forbidden', 'Only a GP or whoever created it can delete this task.', 403)
    await db().query('DELETE FROM core.tasks WHERE id = $1', [t.id])
    if (t.meeting_id && t.meeting_action) await dropActionForTask(t.meeting_id, t.meeting_action)
    return { ok: true }
  }
  const s = z.object({ status: z.enum(['todo', 'doing', 'waiting', 'done']).optional() }).safeParse(body)
  const f = TASK_FIELDS.partial().safeParse(body)
  if (!s.success || !f.success) throw apiError('invalid', 'Check the details.')
  const sets: string[] = []; const args: unknown[] = [t.id]
  const set = (col: string, v: unknown) => { args.push(v); sets.push(col + ' = $' + args.length) }
  const d = f.data
  if (d.title !== undefined && d.title !== t.title) { set('title', d.title); await taskEvent(t.id, user.userId, 'edit', 'Renamed to “' + d.title + '”') }
  if (d.notes !== undefined) set('notes', d.notes || null)
  if (d.business) set('business', d.business)
  if (d.priority && d.priority !== t.priority) { set('priority', d.priority); await taskEvent(t.id, user.userId, 'edit', 'Priority: ' + d.priority) }
  if (d.due_on !== undefined && (d.due_on || null) !== t.due_on) { set('due_on', d.due_on || null); await taskEvent(t.id, user.userId, 'edit', d.due_on ? 'Due ' + d.due_on : 'No due date') }
  if (d.link !== undefined) set('link', d.link || null)
  if (d.repeat) set('repeat', d.repeat)
  if (d.checklist) {
    const was = new Map(t.checklist.map((c) => [c.t, c.d]))
    for (const c of d.checklist) if (was.has(c.t) && was.get(c.t) !== c.d) await taskEvent(t.id, user.userId, 'check', (c.d ? 'Ticked “' : 'Unticked “') + c.t + '”')
    set('checklist', JSON.stringify(d.checklist))
  }
  let newAssignee: string | null = null
  if (d.assignee !== undefined) {
    const [aid, grp] = await resolveAssignee(d.assignee, user)
    if (aid !== t.assignee_id || grp !== t.assignee_group) {
      set('assignee_id', aid); set('assignee_group', grp); newAssignee = aid
      const who = grp === 'gp' ? 'all GPs' : grp === 'team' ? 'the whole team' : (await taskPeople()).find((p) => p.id === aid)?.name ?? 'someone'
      await taskEvent(t.id, user.userId, 'assign', 'Gave it to ' + who)
    }
  }
  if (s.data.status && s.data.status !== t.status) {
    set('status', s.data.status)
    if (s.data.status === 'done') { sets.push('completed_at = now()'); set('completed_by', user.userId) } else if (t.status === 'done') sets.push('completed_at = NULL', 'completed_by = NULL')
    await taskEvent(t.id, user.userId, 'status', 'Moved to ' + STATUS[s.data.status])
  }
  if (!sets.length) return { ok: true }
  await db().query('UPDATE core.tasks SET ' + sets.join(', ') + ', updated_at = now() WHERE id = $1', args)
  if (s.data.status === 'done') await nextRepeat(t.id)
  if (t.meeting_id) await syncActionFromTask(t.id)
  if (newAssignee) await tellAssignee(t.id, newAssignee, user.userId)
  return { ok: true }
})
