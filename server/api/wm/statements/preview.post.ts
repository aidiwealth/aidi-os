// Staff: the PDF of a statement before publishing (from the edited figures).
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin', 'gp', 'team')
  const b = await readBody<{ data: StatementData }>(event)
  if (!b?.data?.summary) throw apiError('invalid', 'Nothing to preview.')
  setResponseHeader(event, 'content-type', 'application/pdf')
  return Buffer.from(await statementPdf(b.data))
})
