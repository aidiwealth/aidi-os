// Public pages (bills, investor statements): download as a typeset PDF. Rate limited.
export default defineEventHandler(async (event) => { rateLimit('pub_pdf', clientIp(event), 40, 60 * 60 * 1000); return renderPdfRequest(event) })
