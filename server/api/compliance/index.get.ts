export interface ObligationRow {
  id: string; title: string; category: string; jurisdiction: string | null; recurrence: string; next_due: string; reminder_days: number
  entity_id: string; entity: string; owner: string | null; active: boolean; days_left: number; last_completed: string | null
}
export default defineEventHandler(async (event): Promise<ObligationRow[]> => {
  await requireRole(event, 'gp', 'team', 'family')
  const r = await db().query<ObligationRow>(
    `SELECT o.id, o.title, o.category, o.jurisdiction, o.recurrence, to_char(o.next_due, 'YYYY-MM-DD') AS next_due, o.reminder_days,
            o.entity_id, e.name AS entity, p.full_name AS owner, o.active, (o.next_due - current_date)::int AS days_left,
            (SELECT to_char(max(c.completed_on), 'YYYY-MM-DD') FROM compliance.completions c WHERE c.obligation_id = o.id) AS last_completed
       FROM compliance.obligations o JOIN core.entities e ON e.id = o.entity_id
       LEFT JOIN core.users u ON u.id = o.owner_id LEFT JOIN core.people p ON p.id = u.person_id
      ORDER BY o.active DESC, o.next_due`)
  return r.rows
})
