import { randomUUID } from 'node:crypto'
// Meeting action items are tasks. Each action has a stable id; its task (for the action's owner, linked back to the
// minutes) follows the action when the minutes are saved, and the action follows the task when it is ticked, given to
// someone else, re-dated or renamed on Tasks. Removing an action removes its task, and the other way round.
interface Act { id?: string; text: string; owner_id?: string | null; owner?: string | null; due?: string | null; done?: boolean }
const bizOf = (entity: string | null) => { const e = (entity ?? '').toLowerCase(); return e.includes('haven') ? 'haven' : e.includes('technolog') ? 'technology' : e.includes('wealth') || e.includes('finance') ? 'wealth' : e.includes('ventures') ? 'ventures' : 'group' }
const fmt = (iso: string) => { const d = new Date(iso); return d.getUTCDate() + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()] + ' ' + d.getUTCFullYear() }

// After the minutes are saved: give new actions an id, then create, update or remove their tasks. Returns the actions
// (with ids) so the page keeps them.
export async function syncMeetingTasks(meetingId: string, byUserId: string): Promise<Act[]> {
  const m = (await db().query<{ title: string; held_at: string; entity: string | null; actions: Act[]; created_by: string | null }>(
    'SELECT m.title, m.held_at, e.name AS entity, m.actions, m.created_by FROM core.meeting_minutes m LEFT JOIN core.entities e ON e.id = m.entity_id WHERE m.id = $1', [meetingId])).rows[0]
  if (!m) return []
  let changed = false
  const acts = (m.actions ?? []).filter((a) => a && String(a.text ?? '').trim()).map((a) => { if (!a.id) { changed = true; return { ...a, id: randomUUID() } } return a })
  if (changed || acts.length !== (m.actions ?? []).length) await db().query('UPDATE core.meeting_minutes SET actions = $2 WHERE id = $1', [meetingId, JSON.stringify(acts)])
  const members = new Set((await taskPeople()).map((p) => p.id))
  const have = new Map((await db().query<{ id: string; action: string; assignee_id: string | null; assignee_group: string | null; status: string }>('SELECT id, meeting_action AS action, assignee_id, assignee_group, status FROM core.tasks WHERE meeting_id = $1', [meetingId])).rows.map((t) => [t.action, t]))
  const note = 'From the minutes of ' + m.title + ' (' + fmt(m.held_at) + ').'
  for (const a of acts) {
    const text = String(a.text).trim(), owner = a.owner_id && members.has(a.owner_id) ? a.owner_id : null, due = a.due && /^\d{4}-\d{2}-\d{2}$/.test(a.due) ? a.due : null
    const notes = note + (text.length > 200 ? '\n' + text : '') + (!owner && a.owner ? '\nOwner: ' + a.owner : '')
    const t = have.get(a.id!)
    if (!t) {
      const r = (await db().query<{ id: string }>(`INSERT INTO core.tasks (meeting_id, meeting_action, title, notes, business, status, due_on, assignee_id, link, created_by, completed_at, completed_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CASE WHEN $6 = 'done' THEN now() END, CASE WHEN $6 = 'done' THEN $10::uuid END) ON CONFLICT DO NOTHING RETURNING id`,
        [meetingId, a.id, text.slice(0, 200), notes, bizOf(m.entity), a.done ? 'done' : 'todo', due, owner, '/meetings/' + meetingId, byUserId])).rows[0]
      if (r) { await taskEvent(r.id, byUserId, 'created', 'From meeting minutes'); if (!a.done) await tellAssignee(r.id, owner, byUserId) }
      continue
    }
    // An existing task: follow the minutes (a group assignment made on Tasks stays unless the minutes name someone).
    const status = a.done ? 'done' : t.status === 'done' ? 'todo' : t.status
    await db().query(`UPDATE core.tasks SET title = $2, due_on = $3, assignee_id = CASE WHEN $4::uuid IS NOT NULL THEN $4::uuid ELSE assignee_id END, assignee_group = CASE WHEN $4::uuid IS NOT NULL THEN NULL ELSE assignee_group END,
        status = $5, completed_at = CASE WHEN $5 = 'done' THEN coalesce(completed_at, now()) END, completed_by = CASE WHEN $5 = 'done' THEN coalesce(completed_by, $6::uuid) END, updated_at = now() WHERE id = $1`,
      [t.id, text.slice(0, 200), due, owner, status, byUserId])
    if (owner && owner !== t.assignee_id) { await taskEvent(t.id, byUserId, 'assign', 'Given to the owner named in the minutes'); if (!a.done) await tellAssignee(t.id, owner, byUserId) }
    if (status !== t.status) await taskEvent(t.id, byUserId, 'status', status === 'done' ? 'Ticked in the minutes' : 'Reopened in the minutes')
  }
  const ids = acts.map((a) => a.id!)
  await db().query('DELETE FROM core.tasks WHERE meeting_id = $1 AND NOT (meeting_action = ANY($2::text[]))', [meetingId, ids])
  return acts
}

// After a linked task changes on Tasks: tick, owner, due date and wording go back to the action in the minutes.
export async function syncActionFromTask(taskId: string): Promise<void> {
  const t = (await db().query<{ meeting_id: string | null; action: string | null; title: string; status: string; due: string | null; assignee_id: string | null }>(
    "SELECT meeting_id, meeting_action AS action, title, status, to_char(due_on, 'YYYY-MM-DD') AS due, assignee_id FROM core.tasks WHERE id = $1", [taskId])).rows[0]
  if (!t?.meeting_id || !t.action) return
  await db().query(`UPDATE core.meeting_minutes SET actions = (SELECT jsonb_agg(CASE WHEN a->>'id' = $2 THEN a || jsonb_build_object('done', $3::boolean, 'due', $4::text, 'owner_id', coalesce($5::text, a->>'owner_id'))
        || CASE WHEN left(a->>'text', 200) <> $6 THEN jsonb_build_object('text', $6::text) ELSE '{}'::jsonb END ELSE a END ORDER BY o) FROM jsonb_array_elements(actions) WITH ORDINALITY x(a, o)), updated_at = now()
     WHERE id = $1 AND jsonb_array_length(actions) > 0`, [t.meeting_id, t.action, t.status === 'done', t.due, t.assignee_id, t.title])
}
// A linked task deleted on Tasks: its action leaves the minutes too.
export async function dropActionForTask(meetingId: string, action: string): Promise<void> {
  await db().query(`UPDATE core.meeting_minutes SET actions = coalesce((SELECT jsonb_agg(a ORDER BY o) FROM jsonb_array_elements(actions) WITH ORDINALITY x(a, o) WHERE a->>'id' <> $2), '[]'::jsonb), updated_at = now() WHERE id = $1`, [meetingId, action])
}
