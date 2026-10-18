// A simple file to fill in: one row per customer per month.
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin', 'gp', 'team')
  setHeader(event, 'content-type', 'text/csv; charset=utf-8')
  setHeader(event, 'content-disposition', 'attachment; filename="customer-revenue-template.csv"')
  return ['Customer,Month,Revenue,Segment,Sector,Country,Plan,Start date,Acquisition cost',
    'Acme Bank,2025-01,12000,Enterprise,Banking,Nigeria,Platform,2024-03-01,15000', 'Acme Bank,2025-02,12500,Enterprise,Banking,Nigeria,Platform,2024-03-01,15000',
    'Bright Shop,2025-01,900,SMB,Retail,Kenya,Starter,2024-11-15,800', 'Bright Shop,2025-02,950,SMB,Retail,Kenya,Starter,2024-11-15,800'].join('\n') + '\n'
})
