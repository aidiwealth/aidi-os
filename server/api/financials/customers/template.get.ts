// The Finvry customer revenue template (same shape as the financials template): customers down the side with who they
// are, months across, and an Exchange rates tab. Read by fixed rules, with no AI.
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin', 'gp', 'team')
  setHeader(event, 'content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  setHeader(event, 'content-disposition', 'attachment; filename="finvry-customer-revenue-template.xlsx"')
  return await customerTemplateWorkbook()
})
