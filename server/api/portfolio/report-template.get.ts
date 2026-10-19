// The Aidi portfolio report template: the format portfolio companies report in, read exactly with no AI.
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team', 'admin')
  const company = String(getQuery(event).company ?? '').slice(0, 120) || undefined
  setHeader(event, 'content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  setHeader(event, 'content-disposition', 'attachment; filename="aidi-portfolio-report-template.xlsx"')
  return await portfolioTemplateWorkbook({ company, months: 6 })
})
