// Wealth client: their financial plan as a PDF report.
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'wealth_client')
  const id = await wmClientOfUser(user.userId)
  if (!id) throw apiError('not_found', 'Not found', 404)
  await rateLimit('wm_plan_pdf', user.userId, 30, 60 * 60 * 1000)
  const { bytes, filename } = await wmReportPdf(id)
  setResponseHeaders(event, { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="' + filename.replace(/["\\\r\n]/g, '') + '"', 'Cache-Control': 'private, no-store' })
  return Buffer.from(bytes)
})
