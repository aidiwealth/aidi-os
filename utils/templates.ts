// Templates to fill in for Sales, Marketing and Banking: the headings Finvry reads, with example rows that show the
// format (they say "delete this row" and are skipped if left in). CSV, so any bank export or spreadsheet can match it.
const EX = ' (delete this row)'
export const TEMPLATES: Record<'sales_deals' | 'marketing_months' | 'bank_txns', { file: string; rows: string[][] }> = {
  bank_txns: { file: 'finvry-bank-transactions-template.csv', rows: [
    ['Date', 'Description', 'Money in', 'Money out', 'Balance', 'Who spent'],
    ['2026-09-01', 'EXAMPLE Acme Ltd invoice 1042' + EX, '2500.00', '', '12500.00', ''],
    ['2026-09-05', 'EXAMPLE AWS' + EX, '', '320.50', '12179.50', 'Ada Obi'],
    ['2026-09-28', 'EXAMPLE Salaries September' + EX, '', '6000.00', '6179.50', ''],
  ] },
  sales_deals: { file: 'finvry-deals-template.csv', rows: [
    ['Deal', 'Customer', 'Contact', 'Value', 'Stage', 'Expected close', 'Source', 'Owner', 'Notes'],
    ['EXAMPLE Acme rollout' + EX, 'Acme Ltd', 'ada@acme.com', '12000', 'Demo', '2026-12-15', 'Referral', 'you@yourcompany.com', 'Pilot agreed'],
  ] },
  marketing_months: { file: 'finvry-marketing-template.csv', rows: [
    ['Month', 'Channel', 'Spend', 'Visitors', 'Leads', 'Marketing qualified', 'Sales qualified', 'Customers', 'Revenue'],
    ['2026-09', 'EXAMPLE Google Ads' + EX, '1500', '4200', '120', '40', '15', '4', '6000'],
  ] },
}
export function downloadTemplate(kind: keyof typeof TEMPLATES) {
  const t = TEMPLATES[kind], csv = t.rows.map((r) => r.map((c) => (/[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c)).join(',')).join('\n') + '\n'
  const u = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), a = document.createElement('a')
  a.href = u; a.download = t.file; a.click(); URL.revokeObjectURL(u)
}
export const isExampleRow = (r: unknown[]) => r.some((c) => typeof c === 'string' && /\(delete this row\)/i.test(c))
