// The cut list as an Excel file to work on offline or share: each recurring payment with its flag, monthly cost,
// saving % (editable, blue) and the monthly saving as a formula; payments worth a look; the last 90 days of payments.
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin', 'gp', 'family')
  const sc = await forecastScope(event), t = await treasuryView(sc), cy = t.currency
  const { default: Excel } = await import('exceljs')
  const wb = new Excel.Workbook(), FLAG: Record<string, string> = { keep: 'KEEP', to_cancel: 'CUT', downgrade: 'DOWNGRADE', review: 'REVIEW', personal: 'PERSONAL' }
  const navy = 'FF0C1A2E', blue = 'FF1F5FA8', head = (ws: import('exceljs').Worksheet, r: number) => { ws.getRow(r).eachCell((c) => { c.font = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Arial', size: 10 }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: navy } } }) }
  const money = '#,##0.00'
  const ws = wb.addWorksheet('Cut list')
  ws.addRow([sc.name + ' - cut list']).font = { bold: true, size: 14, name: 'Arial' }
  ws.addRow(['Recurring payments from the bank ledger, amounts in ' + cy + '. Blue cells are editable: change "Saving %" to model your own cuts. Indicative only.']).font = { italic: true, size: 9, name: 'Arial' }
  ws.addRow([])
  ws.addRow(['Payee', 'Flag', 'Suggested', 'Category', 'Avg monthly', '12-month total', 'Saving %', 'Est. monthly saving', 'Action', 'Last paid']); head(ws, 4)
  const cat = (k: string | null) => t.categories.find((c) => c.key === k)?.label ?? k ?? ''
  const first = 5
  t.cut_list.forEach((v, i) => {
    const pct = v.status === 'downgrade' ? (v.saving_pct ?? 50) : ['to_cancel', 'personal'].includes(v.status) ? (v.saving_pct ?? 100) : 0, r = first + i
    const row = ws.addRow([v.name, FLAG[v.status] ?? v.status.toUpperCase(), v.suggest ? (FLAG[v.suggest.flag] ?? v.suggest.flag) : '', cat(v.category), v.monthly, Math.round(v.total * 100) / 100, pct / 100, { formula: 'E' + r + '*G' + r }, v.note || v.suggest?.why || '', v.last])
    row.getCell(5).numFmt = money; row.getCell(6).numFmt = money; row.getCell(7).numFmt = '0%'; row.getCell(8).numFmt = money
    row.getCell(7).font = { color: { argb: blue }, bold: true }; row.getCell(7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF2FB' } }
  })
  const last = first + t.cut_list.length - 1
  if (t.cut_list.length) { const tr = ws.addRow(['Total', '', '', '', { formula: 'SUM(E' + first + ':E' + last + ')' }, { formula: 'SUM(F' + first + ':F' + last + ')' }, '', { formula: 'SUM(H' + first + ':H' + last + ')' }]); tr.font = { bold: true }; [5, 6, 8].forEach((c) => (tr.getCell(c).numFmt = money)) }
  ws.columns.forEach((c, i) => (c.width = [30, 12, 12, 22, 14, 15, 10, 18, 60, 12][i] ?? 12))
  const w2 = wb.addWorksheet('Worth a look')
  w2.addRow(['Date', 'Payee', 'Amount', 'Who', 'Why']); head(w2, 1)
  for (const c of t.checks) w2.addRow([c.date, c.vendor, c.amount, c.spender ?? '', c.why + (c.count > 1 ? ' (' + c.count + ' payments)' : '')]).getCell(3).numFmt = money
  w2.columns.forEach((c, i) => (c.width = [12, 30, 14, 22, 50][i] ?? 12))
  const main = await companyEntityId(), ent = sc.group ? null : sc.entity
  const pays = (await db().query<{ d: string; spender: string | null; vendor: string; description: string; amount: number; currency: string; category: string | null; account_label: string | null }>(
    "SELECT txn_date::text AS d, spender, vendor, description, amount::float, currency, category, account_label FROM banking.ledger WHERE direction = 'out' AND txn_date >= now() - interval '90 days' AND ($1::uuid IS NULL OR coalesce(entity_id, $2::uuid) = $1) ORDER BY txn_date DESC LIMIT 5000", [ent, main])).rows
  const w3 = wb.addWorksheet('Payments')
  w3.addRow(['Date', 'Who', 'Payee', 'Description', 'Amount', 'Currency', 'Category', 'Account']); head(w3, 1)
  for (const p of pays) w3.addRow([p.d, p.spender ?? '', p.vendor, p.description, p.amount, p.currency, cat(p.category), p.account_label ?? '']).getCell(5).numFmt = money
  w3.columns.forEach((c, i) => (c.width = [12, 20, 26, 40, 14, 9, 22, 22][i] ?? 12))
  const buf = Buffer.from(await wb.xlsx.writeBuffer())
  setHeader(event, 'content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  setHeader(event, 'content-disposition', 'attachment; filename="cut-list-' + new Date().toISOString().slice(0, 10) + '.xlsx"')
  return buf
})
