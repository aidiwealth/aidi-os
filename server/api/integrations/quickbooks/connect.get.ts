// Start connecting QuickBooks for a subject (entity or company): off to Intuit to sign in and approve.
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'admin')
  if (!qbConfigured()) throw apiError('quickbooks_off', 'QuickBooks is not set up yet (NUXT_QUICKBOOKS_CLIENT_ID and NUXT_QUICKBOOKS_CLIENT_SECRET).', 503)
  const subject = String(getQuery(event).subject ?? '')
  if (!/^(entity|company):[0-9a-f-]{36}$/.test(subject)) throw apiError('invalid', 'Choose the entity or company first.')
  const origin = publicOrigin(event)
  return sendRedirect(event, await qbAuthUrl(signState({ o: user.orgId ?? '', u: user.userId, s: subject, exp: Date.now() + 15 * 60 * 1000 }), origin))
})
