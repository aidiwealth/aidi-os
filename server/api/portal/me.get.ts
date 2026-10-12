// The signed-in client contact, their client, companies (with virtual office) and the workspace brand.
export default defineEventHandler(async (event) => {
  const u = await requirePortal(event)
  const companies = await db().query(
    `SELECT id, name, entity_type, jurisdiction, country, ein, address, registered_agent, to_char(agent_renewal, 'YYYY-MM-DD') AS agent_renewal, to_char(agent_resigned_on, 'YYYY-MM-DD') AS agent_resigned_on, virtual_office, mailbox, status,
            to_char(formation_date, 'YYYY-MM-DD') AS formation_date FROM services.companies WHERE client_id = $1 ORDER BY name`, [u.clientId])
  const ra = await raAgents()
  const rows = (companies.rows as { jurisdiction: string | null; registered_agent: string }[]).map((c) => ({ ...c, agent_name: c.registered_agent === 'ours' ? agentFor(ra, c.jurisdiction).name : null }))
  return { name: u.name, email: u.email, client: u.client, companies: rows, workspace: await publicWorkspace() }
})
