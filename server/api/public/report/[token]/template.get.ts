// The Aidi portfolio report template for the founder with this link: months up to the period asked for.
export default defineEventHandler(async (event) => {
  const r = await requestFromToken(event)
  setHeader(event, 'content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  setHeader(event, 'content-disposition', 'attachment; filename="aidi-portfolio-report-template.xlsx"')
  return await portfolioTemplateWorkbook({ company: r.company, months: 6 })
})
