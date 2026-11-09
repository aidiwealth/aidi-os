// Staff: the client's financial plan as a PDF report.
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp', 'team')
  const id = String(getRouterParam(event, 'id') ?? '')
  if (!/^[0-9a-f-]{36}$/.test(id)) throw apiError('not_found', 'Not found', 404)
  const { bytes, filename } = await wmReportPdf(id)
  await audit({ event, actorUserId: user.userId, action: 'wm.report_pdf', objectType: 'wm_client', objectId: id })
  setResponseHeaders(event, { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="' + filename.replace(/["\\\r\n]/g, '') + '"', 'Cache-Control': 'private, no-store' })
  return Buffer.from(bytes)
})
