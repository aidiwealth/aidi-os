// Investor name suggestions while typing: known funds, names at least two companies have added, and your own.
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team')
  const q = String(getQuery(event).q ?? '').trim().slice(0, 80)
  if (q.length < 2) return []
  const org = (await currentOrg())!
  return (await asPlatform(() => db().query<{ name: string }>(`SELECT d.name FROM crm.investor_directory d
      WHERE (d.name_key LIKE crm.name_key($1) || '%' OR d.name_key LIKE '% ' || crm.name_key($1) || '%')
        AND (d.verified OR (SELECT count(*) FROM crm.investor_directory_uses u WHERE u.directory_id = d.id) >= 2 OR EXISTS (SELECT 1 FROM crm.investor_directory_uses u WHERE u.directory_id = d.id AND u.organization_id = $2))
      ORDER BY (d.name_key LIKE crm.name_key($1) || '%') DESC, d.verified DESC, (SELECT count(*) FROM crm.investor_directory_uses u WHERE u.directory_id = d.id) DESC, d.name LIMIT 8`, [q, org.id]))).rows.map((r) => r.name)
})
