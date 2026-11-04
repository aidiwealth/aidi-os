// Wallet statement as CSV, for up to 31 days (?from=YYYY-MM-DD&to=YYYY-MM-DD; the last 31 days by default).
// Longer periods, up to a year, are emailed: POST /api/wallet/statement.
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin', 'gp', 'team', 'family')
  const org = (await currentOrg())!
  const q = getQuery(event)
  const r = statementRange(q.from, q.to)
  if (r.days > STATEMENT_NOW_DAYS) throw apiError('invalid', 'Statements longer than ' + STATEMENT_NOW_DAYS + ' days are emailed to you.')
  const csv = await walletStatementCsv(org.id, r.from, r.till)
  setHeader(event, 'content-type', 'text/csv'); setHeader(event, 'content-disposition', 'attachment; filename="finvry-wallet-' + r.from + '-to-' + r.till + '.csv"')
  return csv
})
