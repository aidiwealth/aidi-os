// The live market strip in the wealth client portal: signed-in wealth clients only (and Aidi admins previewing the
// portal; never a Finvry company's people). Public prices only; nothing about the client.
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'wealth_client', 'admin')
  if (!user.roles.includes('wealth_client') && (await currentOrg())?.kind === 'company') throw apiError('forbidden', 'Not available.', 403)
  setResponseHeader(event, 'cache-control', 'private, max-age=10')
  return marketTicker()
})
