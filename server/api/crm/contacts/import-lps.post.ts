// Aidi OS: bring every fund LP with an email into contacts, in a list called "LPs".
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team')
  const org = (await currentOrg())!
  if (org.kind === 'company') throw apiError('not_found', 'Not found', 404)
  const lps = (await db().query<{ name: string; contact_name: string | null; email: string }>("SELECT name, contact_name, lower(email) AS email FROM funds.lps WHERE email IS NOT NULL AND position('@' IN email) > 1")).rows
  const list = (await db().query<{ id: string }>("INSERT INTO crm.lists (name) VALUES ('LPs') ON CONFLICT (organization_id, name) DO UPDATE SET name = EXCLUDED.name RETURNING id")).rows[0]!.id
  let added = 0
  for (const l of lps) {
    const r = await db().query<{ id: string; added: boolean }>('INSERT INTO crm.contacts (name, email, firm) VALUES ($1,$2,$3) ON CONFLICT (organization_id, email) DO UPDATE SET firm = coalesce(crm.contacts.firm, EXCLUDED.firm) RETURNING id, (xmax = 0) AS added', [l.contact_name || l.name, l.email, l.contact_name ? l.name : null])
    if (r.rows[0]?.added) added++
    await db().query('INSERT INTO crm.list_members (list_id, contact_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [list, r.rows[0]!.id])
  }
  return { ok: true, total: lps.length, added }
})
