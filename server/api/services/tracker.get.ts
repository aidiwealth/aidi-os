// The services tracker: every request by status, and every client's compliance calendar (from their Finvry workspace).
export default defineEventHandler(async (event) => {
  await requireOperator(event)
  const jobs = await db().query(`SELECT j.id, j.title, j.service, j.status, j.priority, to_char(j.due_date, 'YYYY-MM-DD') AS due_date, j.created_at, j.updated_at, j.completed_at, c.id AS client_id, c.name AS client, coalesce(p.full_name, u.email) AS owner,
      (SELECT count(*)::int FROM services.job_events e WHERE e.job_id = j.id AND e.kind = 'client_message') AS client_msgs
    FROM services.jobs j JOIN services.clients c ON c.id = j.client_id LEFT JOIN core.users u ON u.id = j.owner_id LEFT JOIN core.people p ON p.id = u.person_id ORDER BY j.updated_at DESC LIMIT 1000`)
  const comp = await asPlatform(() => db().query(`SELECT o.id, o.title, o.category, o.jurisdiction, o.recurrence, to_char(o.next_due, 'YYYY-MM-DD') AS next_due, (o.next_due - current_date)::int AS days_left, c.id AS client_id, c.name AS client, org.name AS company, org.id AS org_id,
      (SELECT to_char(max(x.completed_on), 'YYYY-MM-DD') FROM compliance.completions x WHERE x.obligation_id = o.id) AS last_done,
      (SELECT x.note FROM compliance.completions x WHERE x.obligation_id = o.id ORDER BY x.created_at DESC LIMIT 1) AS last_note
    FROM compliance.obligations o JOIN core.organizations org ON org.id = o.organization_id AND org.kind = 'company' JOIN services.clients c ON c.workspace_id = org.id
    WHERE o.active ORDER BY o.next_due LIMIT 3000`))
  const done = await asPlatform(() => db().query(`SELECT x.id, o.title, to_char(x.completed_on, 'YYYY-MM-DD') AS completed_on, x.note, org.name AS company FROM compliance.completions x JOIN compliance.obligations o ON o.id = x.obligation_id
    JOIN core.organizations org ON org.id = o.organization_id AND org.kind = 'company' JOIN services.clients c ON c.workspace_id = org.id WHERE x.completed_on > current_date - 90 ORDER BY x.completed_on DESC LIMIT 200`))
  return { jobs: jobs.rows, compliance: comp.rows, done: done.rows }
})
