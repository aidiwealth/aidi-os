// Email a one-time approval code (for people without an authenticator app).
export default defineEventHandler(async (event) => {
  const user = await requireMarkets(event)
  if (await hasAuthenticator(user.userId)) return { method: 'app' }
  await sendFreshCode(user.userId, 'a trade')
  return { method: 'email' }
})
