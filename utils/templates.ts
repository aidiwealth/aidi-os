// Templates to fill in for Banking: the headings Finvry reads, with example rows that show the
// format (they say "delete this row" and are skipped if left in). CSV, so any bank export or spreadsheet can match it.
const EX = ' (delete this row)'
export const TEMPLATES: Record<'bank_txns' | 'brokerage_valuation', { file: string; rows: string[][] }> = {
  // Brokerage and investment accounts: each month end's cash, holdings at market value and total, from the statement.
  brokerage_valuation: { file: 'finvry-brokerage-valuation-template.csv', rows: [
    ['Month end', 'Cash', 'Holdings market value', 'Total account value', 'Accrued interest'],
    ['2026-08-31', '890.43', '105621.87', '106512.30', '1064.58' + EX],
    ['2026-09-30', '1202.93', '105189.29', '106392.22', '1000.81' + EX],
  ] },
  bank_txns: { file: 'finvry-bank-transactions-template.csv', rows: [
    ['Date', 'Description', 'Money in', 'Money out', 'Balance', 'Who spent'],
    ['2026-09-01', 'EXAMPLE Acme Ltd invoice 1042' + EX, '2500.00', '', '12500.00', ''],
    ['2026-09-05', 'EXAMPLE AWS' + EX, '', '320.50', '12179.50', 'Ada Obi'],
    ['2026-09-28', 'EXAMPLE Salaries September' + EX, '', '6000.00', '6179.50', ''],
  ] },
}
export function downloadTemplate(kind: keyof typeof TEMPLATES) {
  const t = TEMPLATES[kind], csv = t.rows.map((r) => r.map((c) => (/[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c)).join(',')).join('\n') + '\n'
  const u = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), a = document.createElement('a')
  a.href = u; a.download = t.file; a.click(); URL.revokeObjectURL(u)
}
export const isExampleRow = (r: unknown[]) => r.some((c) => typeof c === 'string' && /\(delete this row\)/i.test(c))
