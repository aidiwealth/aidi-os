// The client opens their tax information link: questions for the tax year, saved answers and uploaded files.
export default defineEventHandler(async (event) => {
  const r = await infoFromToken(getRouterParam(event, 'token'))
  const files = await db().query('SELECT f.field, d.id, d.title FROM services.request_files f JOIN core.documents d ON d.id = f.document_id WHERE f.request_id = $1 ORDER BY f.created_at', [r.id])
  return { request: { tax_year: r.tax_year, status: r.status, client: r.client, company: r.company, answers: r.answers }, files: files.rows, questions: taxQuestions(r.tax_year), workspace: await publicWorkspace() }
})
