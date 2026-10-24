// Sort the payments still on the automatic guess with AI (in the background; the page refreshes as they land).
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp')
  if (!useRuntimeConfig().anthropicApiKey) throw apiError('ai_off', 'AI is not set up on this server.', 503)
  inBackground('bank-ai', () => aiCategorize(600))
  await audit({ event, actorUserId: user.userId, action: 'treasury.ai_categorize', objectType: 'bank_ledger' })
  return { ok: true }
})
