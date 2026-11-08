// What the chart picker offers: the companies (and the group) and the metrics this workspace has.
export default defineEventHandler(async (event) => {
  await requireUser(event)
  const org = await currentOrg()
  const ents = org?.kind === 'company' ? await custEntities().catch(() => []) : []
  const subjects = [...ents.map((e) => ({ value: 'entity:' + e.id, label: e.name })), ...(ents.length > 1 ? [{ value: 'group', label: 'Group (all companies)' }] : [])]
  const metrics = await metricCatalog().catch(() => [])
  const customers = Number((await db().query<{ n: string }>('SELECT count(*) AS n FROM financials.customers').catch(() => ({ rows: [{ n: '0' }] }))).rows[0]?.n ?? 0) > 0
  return { subjects, metrics, customers }
})
