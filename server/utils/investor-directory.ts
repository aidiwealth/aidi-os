// The shared investor directory: names only, one row per normalised name, never anything about who is talking to whom.
export async function noteInvestor(orgId: string, name: string): Promise<void> {
  const n = name.trim().replace(/\s+/g, ' ')
  if (n.length < 2 || n.length > 200) return
  try {
    await asPlatform(async () => {
      await db().query('INSERT INTO crm.investor_directory (name, name_key) VALUES ($1, crm.name_key($1)) ON CONFLICT (name_key) DO NOTHING', [n])
      const r = await db().query<{ id: string }>('SELECT id FROM crm.investor_directory WHERE name_key = crm.name_key($1)', [n])
      if (r.rows[0]) await db().query('INSERT INTO crm.investor_directory_uses (directory_id, organization_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [r.rows[0].id, orgId])
    })
  } catch (err) { console.error('[directory]', err) }
}
