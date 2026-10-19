// Download team pay for a period (optionally one person or company) as CSV or Excel, with bank status (admins).
export default defineEventHandler(async (event) => {
  await requireTeamManager(event)
  const q = getQuery(event), from = String(q.from ?? ''), to = String(q.to ?? ''), format = q.format === 'xlsx' ? 'xlsx' : 'csv'
  const { rows } = await teamPayHistory(from, to)
  const sel = rows.filter((r) => (!q.person_id || r.person_id === q.person_id) && (!q.entity_id || r.entity_id === q.entity_id) && (!q.bank || r.bank === q.bank))
  const BANK: Record<string, string> = { matched: 'In bank', missing: 'Not in bank', no_statement: 'Awaiting statement', no_account: 'No bank account' }
  const totals: Record<string, number> = {}; for (const r of sel) totals[r.currency] = Math.round(((totals[r.currency] ?? 0) + r.amount) * 100) / 100
  return sendTable(event, { file: 'Team pay ' + from + ' to ' + to, title: 'Team pay', period: (q.label ? String(q.label).slice(0, 60) + ': ' : '') + from + ' to ' + to, format,
    cols: [{ key: 'paid_on', label: 'Paid on' }, { key: 'person', label: 'Person' }, { key: 'entity', label: 'Company' }, { key: 'period', label: 'For' }, { key: 'currency', label: 'Currency' }, { key: 'amount', label: 'Amount', money: true }, { key: 'method', label: 'Method' }, { key: 'reference', label: 'Reference' }, { key: 'bank', label: 'Bank check' }, { key: 'bank_date', label: 'Bank date' }, { key: 'bank_desc', label: 'Bank line' }, { key: 'notes', label: 'Notes' }],
    rows: sel.map((r) => ({ ...r, bank: BANK[r.bank], bank_date: r.bank_txn?.date ?? '', bank_desc: r.bank_txn?.description ?? '' })), totals: [{ label: 'Total', values: totals }] })
})
