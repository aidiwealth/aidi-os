// Banking: the rails, the spend view and the cut list (the bank feed is refreshed first, at most every six hours).
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin', 'gp')
  if ((await currentOrg())?.kind !== 'company') throw apiError('not_found', 'Not found', 404)
  // "Refresh bank feed" waits for the bank; opening the page does not (the feed, linked sheets and tidying run after
  // the response, and on a schedule).
  let added = 0
  const tidy = async () => { await fixOwnTransfers().catch(() => 0); await fixCardPayments().catch(() => 0) }
  if (getQuery(event).sync === '1') { added = await syncBankFeed(true); await tidy() }
  else inBackground('bank', async () => { await syncBankFeed(); await syncDue('bank_txns', null).catch(() => {}); await tidy() })
  const rails = await Promise.all(RAILS.map(async (r) => ({ key: r.key, label: r.label, note: r.note, on: await r.available() })))
  const sc = await forecastScope(event)
  // A Nigerian company (or the subsidiary chosen at the top): no live bank feed until Nigerian connections are switched
  // on, so no "connect" or "refresh" offered there; statements and sheets instead.
  const ng = !sc.group && await nigerianBanking(sc.entity) && !(await monoOn())
  return { ...(await treasuryView(sc)), rails: rails.map((r) => (ng && r.key === 'bank_feed' ? { ...r, on: false, note: 'Live connections for Nigerian banks are coming soon. Upload statements or link a sheet for now.', soon: true } : r)), ng, added, scope: { group: sc.group, entity: sc.entity, name: sc.group ? (await currentOrg())!.name + ' group' : sc.name, companies: sc.companies.map((c) => ({ id: c.id, name: c.name })) } }
})
