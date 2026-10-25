// Banking: the rails, the spend view and the cut list (the bank feed is refreshed first, at most every six hours).
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin', 'gp', 'family')
  // "Refresh bank feed" waits for the bank; opening the page does not (the feed, linked sheets and tidying run after
  // the response, and on a schedule).
  let added = 0
  const tidy = async () => { await fixOwnTransfers().catch(() => 0); await fixCardPayments().catch(() => 0); await pairTransfers().catch(() => 0); await fixBrokerage().catch(() => 0) }
  // Aidi OS: statements imported on Bank & cash come into the ledger first (only what is new).
  const aidi = (await currentOrg())?.kind !== 'company'
  if (aidi) await syncStatementLedger().catch((e) => console.error('[treasury] statements', (e as Error).message))
  if (getQuery(event).sync === '1') { added = await syncBankFeed(true); await tidy() }
  else inBackground('bank', async () => { await syncBankFeed(); await syncDue('bank_txns', null).catch(() => {}); await tidy(); await aiCategorize().catch((e) => console.error('[treasury] ai categories', (e as Error).message)) })
  const rails = await Promise.all(RAILS.map(async (r) => ({ key: r.key, label: r.label, note: r.note, on: await r.available() })))
  const sc = await forecastScope(event)
  // A Nigerian company (or the subsidiary chosen at the top): no live bank feed until Nigerian connections are switched
  // on, so no "connect" or "refresh" offered there; statements and sheets instead.
  const ng = !sc.group && await nigerianBanking(sc.entity) && !(await monoOn())
  return { ...(await treasuryView(sc)), rails: rails.map((r) => (ng && r.key === 'bank_feed' ? { ...r, on: false, note: 'Live connections for Nigerian banks are coming soon. Upload statements or link a sheet for now.', soon: true } : r)), ng, added, scope: { group: sc.group, entity: sc.entity, name: sc.group && !aidi ? (await currentOrg())!.name + ' group' : sc.name, companies: sc.companies.map((c) => ({ id: c.id, name: c.name })) } }
})
