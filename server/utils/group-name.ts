// The name of a company's group (it and its subsidiaries together): the name the founder gave it, else the main
// company's name followed by "group".
export async function groupName(): Promise<string> {
  const org = await currentOrg(); if (!org) return 'Group'
  const own = String(org.settings.group_name ?? '').trim(); if (own) return own
  const main = await companyEntityId().catch(() => null)
  const n = main ? (await db().query<{ name: string }>('SELECT name FROM core.entities WHERE id = $1', [main])).rows[0]?.name : null
  return (n ?? org.name) + ' group'
}
