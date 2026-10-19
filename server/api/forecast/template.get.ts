// The Finvry forecast template: months across, the forecast's lines down the side, totals and cash by formula.
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin', 'gp', 'team')
  const cur = ((await currentOrg())?.settings.currency as string) || 'USD'
  setHeader(event, 'content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  setHeader(event, 'content-disposition', 'attachment; filename="finvry-forecast-template.xlsx"')
  return await forecastTemplateWorkbook({ currency: cur })
})
