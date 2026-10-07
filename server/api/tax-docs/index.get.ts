// Staff: every tax document sent to LPs and wealth clients, and who can receive them.
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin', 'gp', 'team')
  const rows = (await db().query(`SELECT t.id, t.tax_year, t.form_type, t.issuer, t.note, t.created_at, t.notified_at, t.first_viewed_at, t.downloads, t.lp_id, t.wm_client_id, coalesce(l.name, c.name) AS recipient, CASE WHEN t.lp_id IS NOT NULL THEN 'LP' ELSE 'Wealth client' END AS kind, d.title
    FROM core.tax_docs t JOIN core.documents d ON d.id = t.document_id LEFT JOIN funds.lps l ON l.id = t.lp_id LEFT JOIN wm.clients c ON c.id = t.wm_client_id ORDER BY t.created_at DESC LIMIT 500`)).rows
  return { rows, lps: (await db().query('SELECT id, name, email FROM funds.lps ORDER BY name')).rows, clients: (await db().query('SELECT id, name, email, country FROM wm.clients ORDER BY name')).rows, forms: TAX_FORMS }
})
