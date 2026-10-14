// Console: all perks with how many companies claimed each.
export default defineEventHandler(async (event) => {
  await requirePlatform(event)
  return asPlatform(async () => ({ categories: PERK_CATEGORIES,
    perks: (await db().query('SELECT ' + PERK_COLS + ', (SELECT count(*)::int FROM core.perk_claims c WHERE c.perk_id = core.perks.id) AS claims FROM core.perks ORDER BY active DESC, featured DESC, sort, partner')).rows,
    recent: (await db().query("SELECT p.partner, o.name AS company, c.claimed_at FROM core.perk_claims c JOIN core.perks p ON p.id = c.perk_id JOIN core.organizations o ON o.id = c.organization_id ORDER BY c.claimed_at DESC LIMIT 20")).rows }))
})
