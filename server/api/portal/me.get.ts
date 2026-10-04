// The signed-in client contact, their client, companies (with virtual office) and the workspace brand.
export default defineEventHandler(async (event) => {
  const u = await requirePortal(event)
  const companies = await db().query(
    `SELECT id, name, entity_type, jurisdiction, country, ein, address, registered_agent, to_char(agent_renewal, 'YYYY-MM-DD') AS agent_renewal, virtual_office, mailbox, status,
            to_char(formation_date, 'YYYY-MM-DD') AS formation_date FROM services.companies WHERE client_id = $1 ORDER BY name`, [u.clientId])
  return { name: u.name, email: u.email, client: u.client, companies: companies.rows, workspace: await publicWorkspace() }
})
