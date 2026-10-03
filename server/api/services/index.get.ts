export interface JobRow {
  id: string; title: string; service: string; status: string; priority: string; due_date: string | null; overdue: boolean
  client: string; client_id: string; owner: string | null; provider: string | null; updated_at: string
}
export default defineEventHandler(async (event): Promise<JobRow[]> => {
  await requireRole(event, 'team', 'gp')
  const r = await db().query<JobRow>(
    `SELECT j.id, j.title, j.service, j.status, j.priority, to_char(j.due_date, 'YYYY-MM-DD') AS due_date,
            (j.due_date < current_date AND j.status NOT IN ('completed','cancelled')) AS overdue,
            c.name AS client, c.id AS client_id, p.full_name AS owner, e.name AS provider, j.updated_at
       FROM services.jobs j JOIN services.clients c ON c.id = j.client_id
       LEFT JOIN core.users u ON u.id = j.owner_id LEFT JOIN core.people p ON p.id = u.person_id
       LEFT JOIN services.companies e ON e.id = j.company_id
      ORDER BY (j.status IN ('completed','cancelled')), j.due_date NULLS LAST, j.created_at DESC LIMIT 1000`)
  return r.rows
})
