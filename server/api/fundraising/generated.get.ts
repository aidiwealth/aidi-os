// Documents made in Finvry that can go into the data room: SAFEs, deal memos, the NDA, investor updates and LP reports.
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team', 'admin')
  const safes = (await db().query("SELECT id, investor_name || ' · ' || coalesce(to_char(safe_date, 'DD Mon YYYY'), '') AS title FROM fundraise.safes ORDER BY created_at DESC LIMIT 50")).rows
  const memos = (await db().query("SELECT id, coalesce(nullif(title, ''), 'Deal memo') AS title FROM fundraise.memos ORDER BY updated_at DESC LIMIT 50")).rows
  const updates = (await db().query("SELECT id, coalesce(nullif(title, ''), 'Update') AS title FROM financials.updates WHERE NOT coalesce(is_template, false) ORDER BY coalesce(sent_at, created_at) DESC LIMIT 50").catch(() => ({ rows: [] }))).rows
  const org = await currentOrg(); const b = org ? await brandingOf(org.id).catch(() => null) : null
  return { safes, memos, updates, nda: !!b?.nda_text }
})
