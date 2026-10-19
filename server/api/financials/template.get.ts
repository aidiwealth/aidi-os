// The Finvry financials template (Excel): months across, Finvry's line names down the side, totals by formula.
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin', 'gp', 'team')
  const org = await currentOrg()
  const cur = String((org?.settings.reporting_currency as string | undefined) || (org?.settings.currency as string | undefined) || 'USD')
  setHeader(event, 'content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  setHeader(event, 'content-disposition', 'attachment; filename="finvry-financials-template.xlsx"')
  return await templateWorkbook(/^[A-Z]{3}$/.test(cur) ? cur : 'USD')
})
