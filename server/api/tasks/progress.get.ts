// For GPs: what everyone has done and has open (this month and this week), by person and by business, and what was
// just finished.
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  if (!isTaskGp(user.roles)) throw apiError('forbidden', 'For GPs.', 403)
  const who = `CASE WHEN t.assignee_group = 'gp' THEN 'gp' WHEN t.assignee_group = 'team' THEN 'team' ELSE t.assignee_id::text END`
  const people = (await db().query<{ key: string; name: string; done_month: number; done_week: number; open: number; late: number; due_week: number }>(
    `SELECT ${who} AS key, CASE WHEN t.assignee_group = 'gp' THEN 'All GPs' WHEN t.assignee_group = 'team' THEN 'Whole team' ELSE coalesce(max(p.full_name), max(u.email), 'No one') END AS name,
            count(*) FILTER (WHERE t.status = 'done' AND t.completed_at >= date_trunc('month', now()))::int AS done_month,
            count(*) FILTER (WHERE t.status = 'done' AND t.completed_at >= date_trunc('week', now()))::int AS done_week,
            count(*) FILTER (WHERE t.status <> 'done')::int AS open,
            count(*) FILTER (WHERE t.status <> 'done' AND t.due_on < current_date)::int AS late,
            count(*) FILTER (WHERE t.status <> 'done' AND t.due_on < date_trunc('week', now())::date + 7)::int AS due_week
       FROM core.tasks t LEFT JOIN core.users u ON u.id = t.assignee_id LEFT JOIN core.people p ON p.id = u.person_id
      GROUP BY ${who}, t.assignee_group HAVING count(*) FILTER (WHERE t.status <> 'done' OR t.completed_at >= date_trunc('month', now())) > 0 ORDER BY 2`)).rows
  const biz = (await db().query<{ business: string; done: number; open: number }>(
    `SELECT business, count(*) FILTER (WHERE status = 'done' AND completed_at >= date_trunc('month', now()))::int AS done, count(*) FILTER (WHERE status <> 'done')::int AS open
       FROM core.tasks GROUP BY business HAVING count(*) FILTER (WHERE status <> 'done' OR completed_at >= date_trunc('month', now())) > 0 ORDER BY open DESC`)).rows
  const k = (await db().query<{ done_month: number; done_week: number; open: number; due_week: number; late: number; oldest_late: number | null; on_time: number | null }>(
    `SELECT count(*) FILTER (WHERE status = 'done' AND completed_at >= date_trunc('month', now()))::int AS done_month,
            count(*) FILTER (WHERE status = 'done' AND completed_at >= date_trunc('week', now()))::int AS done_week,
            count(*) FILTER (WHERE status <> 'done')::int AS open,
            count(*) FILTER (WHERE status <> 'done' AND due_on < date_trunc('week', now())::date + 7)::int AS due_week,
            count(*) FILTER (WHERE status <> 'done' AND due_on < current_date)::int AS late,
            max(current_date - due_on) FILTER (WHERE status <> 'done' AND due_on < current_date)::int AS oldest_late,
            round(100.0 * count(*) FILTER (WHERE status = 'done' AND completed_at >= date_trunc('month', now()) AND due_on IS NOT NULL AND completed_at::date <= due_on)
              / nullif(count(*) FILTER (WHERE status = 'done' AND completed_at >= date_trunc('month', now()) AND due_on IS NOT NULL), 0))::int AS on_time
       FROM core.tasks`)).rows[0]!
  const recent = (await db().query(`SELECT ${TASK_COLS} FROM core.tasks t ${TASK_JOINS} WHERE t.status = 'done' ORDER BY t.completed_at DESC LIMIT 8`)).rows
  return { people, biz, kpis: k, recent, businesses: TASK_BIZ }
})
