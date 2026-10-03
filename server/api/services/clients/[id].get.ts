// One client: details, companies, people, jobs and invoices.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  await requireRole(event, 'team', 'gp')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw apiError('not_found', 'Client not found', 404)
  const c = await db().query('SELECT id, name, kind, contact_name, email, phone, country, address, notes, status, created_at FROM services.clients WHERE id = $1', [id.data])
  if (!c.rows[0]) throw apiError('not_found', 'Client not found', 404)
  const companies = await db().query("SELECT *, to_char(formation_date, 'YYYY-MM-DD') AS formation_date, to_char(agent_renewal, 'YYYY-MM-DD') AS agent_renewal FROM services.companies WHERE client_id = $1 ORDER BY name", [id.data])
  const people = await db().query('SELECT p.*, p.ownership_pct::text, co.name AS company FROM services.people p LEFT JOIN services.companies co ON co.id = p.company_id WHERE p.client_id = $1 ORDER BY p.name', [id.data])
  const jobs = await db().query("SELECT id, title, service, status, to_char(due_date, 'YYYY-MM-DD') AS due_date FROM services.jobs WHERE client_id = $1 ORDER BY created_at DESC", [id.data])
  const invoices = await db().query("SELECT id, number, currency, amount::text, status, to_char(due_date, 'YYYY-MM-DD') AS due_date, (status = 'sent' AND due_date < current_date) AS overdue FROM services.invoices WHERE client_id = $1 ORDER BY issue_date DESC", [id.data])
  return { client: c.rows[0], companies: companies.rows, people: people.rows, jobs: jobs.rows, invoices: invoices.rows }
})
