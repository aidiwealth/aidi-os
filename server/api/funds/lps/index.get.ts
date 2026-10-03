// The LP register, with total commitments across funds.
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team')
  return (await db().query(
    `SELECT l.id, l.name, l.kind, l.contact_name, l.email, l.country, l.kyc_status, (l.portal_token_expires > now()) AS portal,
            coalesce((SELECT sum(amount) FROM funds.commitments WHERE lp_id = l.id), 0)::text AS committed, (SELECT count(*)::int FROM funds.commitments WHERE lp_id = l.id) AS funds
       FROM funds.lps l ORDER BY l.name`)).rows
})
