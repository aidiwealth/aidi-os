// Console: the investors and grants founders can search.
export default defineEventHandler(async (event) => {
  await requirePlatform(event)
  return { items: await allProspects(false), stages: RAISE_STAGE_LABEL, sectors: RAISE_SECTOR_LABEL, types: PROSPECT_TYPE_LABEL }
})
