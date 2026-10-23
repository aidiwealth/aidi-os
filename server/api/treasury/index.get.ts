// Banking & Treasury: the rails, the spend view and the cut list (the bank feed is refreshed first, at most every six hours).
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin', 'gp')
  if ((await currentOrg())?.kind !== 'company') throw apiError('not_found', 'Not found', 404)
  const added = await syncBankFeed(getQuery(event).sync === '1')
  const rails = await Promise.all(RAILS.map(async (r) => ({ key: r.key, label: r.label, note: r.note, on: await r.available() })))
  return { ...(await treasuryView()), rails, added }
})
