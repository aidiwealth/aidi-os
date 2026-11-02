import { z } from 'zod'
// Tasks for the Aidi team. GPs, family members and admins see every task (each other's, and the whole team's); team members see only theirs, the ones they created and the
// ones for the whole team — never tasks for GPs or for a GP.
export const TASK_BIZ: Record<string, string> = { group: 'Group', ventures: 'Aidi Ventures', technology: 'Aidi Technology', haven: 'Aidi Haven', finvry: 'Finvry', wealth: 'Aidi Wealth' }
export const isTaskGp = (roles: string[]) => roles.includes('admin') || roles.includes('gp') || roles.includes('family')
export interface TaskRow { meeting_id: string | null; meeting_action: string | null; id: string; title: string; notes: string | null; business: string; status: string; priority: string; due_on: string | null; assignee_id: string | null; assignee_group: string | null; assignee_name: string | null; link: string | null; checklist: { t: string; d: boolean }[]; repeat: string; created_by: string | null; creator_name: string | null; created_at: string; completed_at: string | null; completed_by_name: string | null }
export const TASK_COLS = `t.meeting_id, t.meeting_action, t.id, t.title, t.notes, t.business, t.status, t.priority, to_char(t.due_on, 'YYYY-MM-DD') AS due_on, t.assignee_id, t.assignee_group,
  ap.full_name AS assignee_name, t.link, t.checklist, t.repeat, t.created_by, cp.full_name AS creator_name, t.created_at, t.completed_at, dp.full_name AS completed_by_name`
export const TASK_JOINS = `LEFT JOIN core.users au ON au.id = t.assignee_id LEFT JOIN core.people ap ON ap.id = au.person_id
  LEFT JOIN core.users cu ON cu.id = t.created_by LEFT JOIN core.people cp ON cp.id = cu.person_id
  LEFT JOIN core.users du ON du.id = t.completed_by LEFT JOIN core.people dp ON dp.id = du.person_id`
// The WHERE clause for what this person may see ($1 = their user id, $2 = whether they are a GP or admin).
export const TASK_SEE = `($2::boolean OR t.assignee_id = $1 OR t.created_by = $1 OR t.assignee_group = 'team')`

// The people tasks can go to: active members who are admins, GPs or team.
export async function taskPeople(): Promise<{ id: string; name: string; email: string; gp: boolean }[]> {
  return (await db().query<{ id: string; name: string; email: string; gp: boolean }>(
    `SELECT u.id, coalesce(nullif(p.full_name, ''), u.email) AS name, u.email, bool_or(ur.role_code IN ('admin', 'gp', 'family')) AS gp
       FROM core.memberships m JOIN core.users u ON u.id = m.user_id LEFT JOIN core.people p ON p.id = u.person_id JOIN core.user_roles ur ON ur.user_id = u.id
      WHERE m.status = 'active' AND ur.role_code IN ('admin', 'gp', 'family', 'team') GROUP BY u.id, p.full_name, u.email ORDER BY 2`)).rows
}

export async function taskFor(id: string, me: { userId: string; roles: string[] }): Promise<TaskRow> {
  const r = (await db().query<TaskRow>(`SELECT ${TASK_COLS} FROM core.tasks t ${TASK_JOINS} WHERE t.id = $3 AND ${TASK_SEE}`, [me.userId, isTaskGp(me.roles), id])).rows[0]
  if (!r) throw apiError('not_found', 'Task not found', 404)
  return r
}
export async function taskEvent(taskId: string, userId: string, kind: string, body: string | null = null) {
  await db().query('INSERT INTO core.task_events (task_id, user_id, kind, body) VALUES ($1, $2, $3, $4)', [taskId, userId, kind, body ? body.slice(0, 2000) : null])
}
// A repeating task, once done, makes the next one (once): same details, checklist unticked, due a week or a month on.
export async function nextRepeat(taskId: string): Promise<void> {
  await db().query(`INSERT INTO core.tasks (title, notes, business, priority, due_on, assignee_id, assignee_group, link, checklist, repeat, repeat_of, created_by)
    SELECT title, notes, business, priority,
           (CASE WHEN repeat = 'weekly' THEN coalesce(due_on, current_date) + 7 ELSE (coalesce(due_on, current_date) + interval '1 month')::date END),
           assignee_id, assignee_group, link, coalesce((SELECT jsonb_agg(jsonb_build_object('t', x->>'t', 'd', false)) FROM jsonb_array_elements(checklist) x), '[]'::jsonb), repeat, id, created_by
      FROM core.tasks t WHERE t.id = $1 AND t.repeat <> 'none' AND NOT EXISTS (SELECT 1 FROM core.tasks n WHERE n.repeat_of = t.id)`, [taskId])
}
// Email the person a task was given to (not when they gave it to themselves).
export async function tellAssignee(taskId: string, assigneeId: string | null, byUserId: string): Promise<void> {
  if (!assigneeId || assigneeId === byUserId) return
  const r = (await db().query<{ email: string; name: string | null; by: string | null; title: string; due: string | null; notes: string | null }>(
    `SELECT u.email, p.full_name AS name, bp.full_name AS by, t.title, to_char(t.due_on, 'YYYY-MM-DD') AS due, t.notes FROM core.tasks t JOIN core.users u ON u.id = $2 LEFT JOIN core.people p ON p.id = u.person_id
      LEFT JOIN core.users bu ON bu.id = $3 LEFT JOIN core.people bp ON bp.id = bu.person_id WHERE t.id = $1`, [taskId, assigneeId, byUserId])).rows[0]
  if (r) await sendTaskAssigned(r.email, (r.name ?? '').split(' ')[0] || 'there', r.by ?? 'A colleague', { id: taskId, title: r.title, due: r.due, notes: r.notes }).catch((e) => console.error('[tasks] email', e))
}

export const TASK_FIELDS = z.object({
  title: z.string().trim().min(1).max(200), notes: z.string().trim().max(4000).nullable().optional(),
  business: z.enum(['group', 'ventures', 'technology', 'haven', 'finvry', 'wealth']).optional(),
  priority: z.enum(['urgent', 'high', 'normal', 'low']).optional(), due_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  assignee: z.string().max(40).optional(), link: z.string().trim().max(300).regex(/^\//).nullable().optional().or(z.literal('')),
  checklist: z.array(z.object({ t: z.string().trim().min(1).max(200), d: z.boolean() })).max(50).optional(), repeat: z.enum(['none', 'weekly', 'monthly']).optional() })
// 'me', a user id, 'gp' or 'team' → (assignee_id, assignee_group), checked against who may give tasks to whom.
export async function resolveAssignee(v: string | undefined, me: { userId: string; roles: string[] }): Promise<[string | null, string | null]> {
  if (!v || v === 'me') return [me.userId, null]
  const gp = isTaskGp(me.roles)
  if (v === 'team') return [null, 'team']
  if (v === 'gp') { if (!gp) throw apiError('forbidden', 'Only GPs can give tasks to all GPs.', 403); return [null, 'gp'] }
  const p = (await taskPeople()).find((x) => x.id === v)
  if (!p) throw apiError('invalid', 'Choose someone on the team.')
  if (p.gp && !gp && p.id !== me.userId) throw apiError('forbidden', 'Only GPs can give tasks to a GP.', 403)
  return [p.id, null]
}
