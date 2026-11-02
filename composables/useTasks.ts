// Shared bits for the Tasks pages: types, due-date wording and the groups a list falls into.
export interface Task { id: string; title: string; notes: string | null; business: string; status: 'todo' | 'doing' | 'waiting' | 'done'; priority: 'urgent' | 'high' | 'normal' | 'low'; due_on: string | null; assignee_id: string | null; assignee_group: 'gp' | 'team' | null; assignee_name: string | null; link: string | null; checklist: { t: string; d: boolean }[]; repeat: 'none' | 'weekly' | 'monthly'; created_by: string | null; creator_name: string | null; created_at: string; completed_at: string | null; completed_by_name: string | null }
export interface TaskPerson { id: string; name: string; gp: boolean }
export const TASK_STATUS: [Task['status'], string][] = [['todo', 'To do'], ['doing', 'Doing'], ['waiting', 'Waiting'], ['done', 'Done']]
export const TASK_PRI: [Task['priority'], string][] = [['urgent', 'Urgent'], ['high', 'High'], ['normal', 'Normal'], ['low', 'Low']]
export const TASK_BIZ_UI: [string, string][] = [['group', 'Group'], ['ventures', 'Aidi Ventures'], ['technology', 'Aidi Technology'], ['haven', 'Aidi Haven'], ['finvry', 'Finvry'], ['wealth', 'Aidi Wealth']]
export const bizName = (k: string) => TASK_BIZ_UI.find((b) => b[0] === k)?.[1] ?? k
export const priName = (k: string) => TASK_PRI.find((b) => b[0] === k)?.[1] ?? k
// Today in the team's time zone (San Jose), the same on the server and in the browser.
const todayIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const addDays = (iso: string, n: number) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10)
// Dates written the same way on the server and in the browser (toLocaleDateString differs between them).
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export function fmtDay(iso: string, wd = false): string { const d = new Date(iso.slice(0, 10) + 'T00:00:00Z'); return (wd ? WD[d.getUTCDay()] + ' ' : '') + d.getUTCDate() + ' ' + MON[d.getUTCMonth()] }
// A timestamp in the viewer's own time zone (render only once mounted).
export function fmtStamp(ts: string, time = true): string { const d = new Date(ts); return d.getDate() + ' ' + MON[d.getMonth()] + (time ? ', ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') : '') }
export function dueLabel(iso: string | null): { text: string; cls: string } {
  if (!iso) return { text: 'No date', cls: 'nd' }
  const t = todayIso(), diff = Math.round((Date.parse(iso) - Date.parse(t)) / 864e5)
  const short = fmtDay(iso)
  if (diff < 0) return { text: short, cls: 'od' }
  if (diff === 0) return { text: 'Today', cls: 'td' }
  if (diff === 1) return { text: 'Tomorrow', cls: '' }
  if (diff < 7) return { text: fmtDay(iso, true), cls: '' }
  return { text: short, cls: '' }
}
// End of this week (Sunday).
export function weekEnd(): string { const t = todayIso(); const dow = new Date(t + 'T00:00:00Z').getUTCDay(); return addDays(t, dow === 0 ? 0 : 7 - dow) }
export function taskGroups(list: Task[]): { key: string; label: string; items: Task[] }[] {
  const t = todayIso(), we = weekEnd()
  const g = { od: [] as Task[], wk: [] as Task[], later: [] as Task[], done: [] as Task[] }
  for (const x of list) {
    if (x.status === 'done') g.done.push(x)
    else if (x.due_on && x.due_on < t) g.od.push(x)
    else if (x.due_on && x.due_on <= we) g.wk.push(x)
    else g.later.push(x)
  }
  g.done.sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''))
  return [{ key: 'od', label: 'Overdue', items: g.od }, { key: 'wk', label: 'This week', items: g.wk }, { key: 'later', label: 'Later', items: g.later }, { key: 'done', label: 'Done lately', items: g.done }].filter((x) => x.items.length)
}
export const initials = (n: string | null) => (n ?? '?').split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('')
export const whoName = (x: Task) => (x.assignee_group === 'gp' ? 'All GPs' : x.assignee_group === 'team' ? 'Whole team' : x.assignee_name ?? 'No one')
export const assigneeValue = (x: Task) => x.assignee_group ?? x.assignee_id ?? ''
export const taskErr = (e: unknown) => (e as { data?: { data?: { error?: { message?: string } } } }).data?.data?.error?.message ?? 'Could not save.'
