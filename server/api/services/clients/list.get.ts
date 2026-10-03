// Clients with their companies, open jobs and unpaid invoices.
export default defineEventHandler(async (event) => {
  await requireRole(event, 'team', 'gp')
  return (await db().query(
    `SELECT c.id, c.name, c.kind, c.contact_name, c.email, c.country, c.status,
            (SELECT count(*)::int FROM services.companies WHERE client_id = c.id) AS companies,
            (SELECT count(*)::int FROM services.jobs WHERE client_id = c.id AND status NOT IN ('completed','cancelled')) AS open_jobs,
            (SELECT count(*)::int FROM services.invoices WHERE client_id = c.id AND status = 'sent') AS unpaid
       FROM services.clients c ORDER BY c.name`)).rows
})
