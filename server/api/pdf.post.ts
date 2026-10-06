// Signed-in users: download any document or invoice as a typeset PDF.
export default defineEventHandler(async (event) => { await requireUser(event); return renderPdfRequest(event) })
