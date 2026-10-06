export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team')
  return (await db().query("SELECT id, name, country, sector, kind, monitor, (SELECT json_build_object('score', c.score, 'band', c.band, 'status', c.status, 'at', c.created_at) FROM credit.checks c WHERE c.borrower_id = credit.borrowers.id AND c.guarantor_id IS NULL ORDER BY c.created_at DESC LIMIT 1) AS last_check FROM credit.borrowers ORDER BY name")).rows
})
