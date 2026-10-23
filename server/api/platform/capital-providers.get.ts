// The capital-provider directory for the Stage Monitor (console). Founders only see verified, active providers.
export default defineEventHandler(async (event) => {
  const staff = await requirePlatform(event)
  const rows = (await asPlatform(() => db().query(`SELECT id, name, kind, instrument, countries, stages, sectors, ticket_min::float, ticket_max::float, currency, criteria, link, source, to_char(verified_on, 'YYYY-MM-DD') AS verified_on, affiliate, active
    FROM platform.capital_providers ORDER BY verified_on IS NULL, affiliate DESC, lower(name)`))).rows
  return { providers: rows, rules: await stageRules(), can_edit: staff.staffRole !== 'support' }
})
